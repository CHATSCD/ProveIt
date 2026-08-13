import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { differenceInSeconds, format } from 'date-fns'

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function PhotoSlot({ index, photo, onCapture, onRemove }) {
  const inputRef = useRef()

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      onCapture(index, file, url)
    }
    e.target.value = ''
  }

  return (
    <div>
      {photo ? (
        <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
          <img src={photo.preview} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
          <button
            onClick={() => onRemove(index)}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
            style={{ background: 'rgba(0,0,0,0.7)' }}
          >
            ✕
          </button>
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg text-xs font-bold text-white"
               style={{ background: 'rgba(34,197,94,0.8)' }}>
            ✓ Photo {index + 1}
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-2xl flex flex-col items-center justify-center gap-3 transition-all"
          style={{ aspectRatio: '4/3', background: '#1a2235', border: '2px dashed #374151' }}
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm font-medium text-gray-400">
            {index === 0 ? 'Required' : index === 1 ? 'Required' : 'Optional'} Photo {index + 1}
          </span>
          <span className="text-xs text-gray-600">Tap to capture</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
        </button>
      )}
      {!photo && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      )}
    </div>
  )
}

export default function CheckPage() {
  const { token } = useParams()
  const { employee } = useAuth()
  const navigate = useNavigate()

  const [checkRequest, setCheckRequest] = useState(null)
  const [station, setStation] = useState(null)
  const [photos, setPhotos] = useState([null, null, null])
  const [note, setNote] = useState('')
  const [geolocation, setGeolocation] = useState(null)
  const [geoError, setGeoError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    loadCheck()
    getGeolocation()
  }, [token])

  useEffect(() => {
    if (!checkRequest) return
    const interval = setInterval(() => {
      const secs = differenceInSeconds(new Date(checkRequest.expires_at), new Date())
      if (secs <= 0) {
        setExpired(true)
        setRemaining(0)
      } else {
        setRemaining(secs)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [checkRequest])

  async function loadCheck() {
    setLoading(true)
    try {
      const { data: stationData } = await supabase
        .from('stations')
        .select('*')
        .eq('qr_code_token', token)
        .eq('is_active', true)
        .single()

      if (!stationData) {
