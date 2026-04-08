import Navbar, { BottomNav } from './Navbar'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <Navbar />
      <main className="pb-20 md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
