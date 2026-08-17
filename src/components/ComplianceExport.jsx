import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'
import { jsPDF } from 'jspdf'

async function getImgData(url) {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const MAX = 800
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve({ data: canvas.toDataURL('image/jpeg', 0.8), w: canvas.width, h: canvas.height })
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export default function ComplianceExport({ onClose }) {
  const { employee } = useAuth()

  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const [startDate, setStartDate] = useState(format(firstOfMonth, 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'))
  const [signerName, setSignerName] = useState(employee?.display_name || '')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')

  async function generate() {
    setGenerating(true)
    setProgress('Loading submissions...')
    try {
      const start = new Date(startDate + 'T00:00:00')
      const end = new Date(endDate + 'T23:59:59')

      const { data: subs } = await supabase
        .from('submissions')
        .select(`
          id, photo_urls, manager_rating_total, is_late, submitted_at, notes,
          employees(display_name),
          check_requests(triggered_at, trigger_type, stations(name, location_id))
        `)
        .gte('submitted_at', start.toISOString())
        .lte('submitted_at', end.toISOString())
        .order('submitted_at', { ascending: true })

      const locSubs = (subs || []).filter(
        s => s.check_requests?.stations?.location_id === employee.location_id
      )

      setProgress('Building PDF...')

      const doc = new jsPDF('p', 'mm', 'a4')
      const PW = 210, PH = 297
      const ML = 15, MT = 15
      const UW = 180 // usable width

      const orange = [255, 107, 43]
      const darkBg = [20, 28, 45]
      const rowBg1 = [22, 30, 48]
      const rowBg2 = [28, 38, 58]
      const grayText = [120, 130, 150]
      const lightText = [210, 215, 225]

      let y = MT

      // ── Title bar ─────────────────────────────────────────────────────
      doc.setFillColor(...orange)
      doc.rect(ML, y, UW, 2, 'F')
      y += 6

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(...orange)
      doc.text('ProveIt', ML, y)

      doc.setFontSize(14)
      doc.setTextColor(...lightText)
      doc.text('Compliance Report', ML + 32, y)
      y += 8

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...grayText)
      doc.text(`Period: ${format(start, 'MMMM d, yyyy')} – ${format(end, 'MMMM d, yyyy')}`, ML, y)
      doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, PW - ML, y, { align: 'right' })
      y += 12

      // ── Summary cards ────────────────────────────────────────────────
      const total = locSubs.length
      const onTime = locSubs.filter(s => !s.is_late).length
      const late = locSubs.filter(s => s.is_late).length
      const rated = locSubs.filter(s => s.manager_rating_total != null)
      const avgRating = rated.length > 0
        ? (rated.reduce((sum, s) => sum + s.manager_rating_total, 0) / rated.length).toFixed(1)
        : '—'
      const compliance = total > 0 ? Math.round((onTime / total) * 100) : 0

      const summaryItems = [
        { label: 'Total Submissions', value: String(total) },
        { label: 'On Time', value: `${onTime} (${compliance}%)` },
        { label: 'Late', value: String(late) },
        { label: 'Avg Rating', value: `${avgRating}/15` },
      ]

      const cardW = UW / 4 - 2
      summaryItems.forEach((item, i) => {
        const cx = ML + i * (cardW + 2.5)
        doc.setFillColor(...darkBg)
        doc.roundedRect(cx, y, cardW, 16, 2, 2, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(...orange)
        doc.text(item.value, cx + cardW / 2, y + 7, { align: 'center' })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...grayText)
        doc.text(item.label, cx + cardW / 2, y + 13, { align: 'center' })
      })
      y += 22

      // ── Table header ─────────────────────────────────────────────────
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...lightText)
      doc.text('Submissions', ML, y)
      y += 5

      doc.setFillColor(...darkBg)
      doc.rect(ML, y, UW, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...grayText)

      const cols = ['Station', 'Date & Time', 'Employee', 'Status', 'Score']
      const colW = [48, 38, 42, 22, 18]
      let hx = ML + 2
      cols.forEach((c, i) => {
        doc.text(c, hx, y + 4.5)
        hx += colW[i]
      })
      y += 9

      // ── Submission rows ───────────────────────────────────────────────
      for (let idx = 0; idx < locSubs.length; idx++) {
        const sub = locSubs[idx]
        const hasPhotos = sub.photo_urls?.length > 0
        const photoH = hasPhotos ? 42 : 0
        const rowH = 10 + photoH

        if (y + rowH > PH - 20) {
          doc.addPage()
          y = MT
        }

        doc.setFillColor(...(idx % 2 === 0 ? rowBg1 : rowBg2))
        doc.rect(ML, y, UW, rowH, 'F')

        // Text row
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...lightText)

        const cells = [
          sub.check_requests?.stations?.name || '—',
          format(new Date(sub.submitted_at), 'MMM d, h:mm a'),
          sub.employees?.display_name || '—',
          sub.is_late ? 'Late' : 'On Time',
          sub.manager_rating_total != null ? `${sub.manager_rating_total}/15` : 'Unrated',
        ]

        let cx = ML + 2
        cells.forEach((val, i) => {
          if (i === 3) {
            doc.setTextColor(sub.is_late ? 245 : 74, sub.is_late ? 158 : 222, sub.is_late ? 11 : 128)
          } else {
            doc.setTextColor(...lightText)
          }
          const clipped = doc.splitTextToSize(String(val), colW[i] - 3)[0] || ''
          doc.text(clipped, cx, y + 6)
          cx += colW[i]
        })

        // Photos
        if (hasPhotos) {
          setProgress(`Processing photos ${idx + 1}/${locSubs.length}...`)
          let px = ML + 2
          const photoSlots = sub.photo_urls.slice(0, 2)
          for (const photoUrl of photoSlots) {
            const imgData = await getImgData(photoUrl)
            if (imgData) {
              const maxW = 55, maxH = 36
              const aspect = imgData.w / imgData.h
              let iw = maxW
              let ih = maxW / aspect
              if (ih > maxH) { ih = maxH; iw = maxH * aspect }
              try {
                doc.addImage(imgData.data, 'JPEG', px, y + 11, iw, ih)
              } catch {
                // unsupported image format — skip this photo in the PDF
              }
              px += iw + 4
            }
          }
        }

        y += rowH + 1
      }

      // ── Signature ─────────────────────────────────────────────────────
      if (y > PH - 35) { doc.addPage(); y = MT }
      y += 10
      doc.setDrawColor(...grayText)
      doc.setLineWidth(0.3)
      doc.line(ML, y, ML + 90, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...grayText)
      doc.text(`Manager: ${signerName}`, ML, y + 5)
      doc.text(`Date: ${format(new Date(), 'MMMM d, yyyy')}`, ML, y + 11)

      // Footer on all pages
      const pages = doc.getNumberOfPages()
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p)
        doc.setFontSize(7.5)
        doc.setTextColor(...grayText)
        doc.text(
          `ProveIt Compliance Report  •  Page ${p} of ${pages}`,
          PW / 2,
          PH - 7,
          { align: 'center' }
        )
      }

      setProgress('Saving...')
      const filename = `compliance-${format(start, 'yyyy-MM-dd')}-to-${format(end, 'yyyy-MM-dd')}.pdf`
      doc.save(filename)
      onClose()
    } catch (err) {
      console.error(err)
      setProgress(`Error: ${err.message}`)
      setGenerating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-md"
        style={{ background: '#1a2235', border: '1px solid #2d3748' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-black text-white">Export Compliance Report</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <p className="text-gray-400 text-sm mb-5">
          Download a PDF with all submissions, photos, and ratings — ready for health inspections.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
                style={{ background: '#111827', border: '1px solid #2d3748' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
                style={{ background: '#111827', border: '1px solid #2d3748' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Manager signature name
            </label>
            <input
              type="text"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: '#111827', border: '1px solid #2d3748' }}
            />
          </div>

          {generating && progress && (
            <div className="text-sm text-center py-2" style={{ color: '#ff6b2b' }}>
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin mx-auto mb-2"
                style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}
              ></div>
              {progress}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={generate}
              disabled={generating}
              className="flex-1 py-3 rounded-xl font-bold text-sm text-white"
              style={{
                background: generating ? '#374151' : '#ff6b2b',
                cursor: generating ? 'not-allowed' : 'pointer',
              }}
            >
              {generating ? 'Generating...' : '⬇ Download PDF'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-medium text-sm"
              style={{ background: '#374151', color: '#9ca3af' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
