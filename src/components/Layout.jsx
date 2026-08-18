import Navbar, { BottomNav } from './Navbar'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pb-24 md:pb-10 animate-in">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
