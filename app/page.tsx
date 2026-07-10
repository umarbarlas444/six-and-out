import { redirect } from 'next/navigation'

// The app lives under /dashboard (auth-protected). Send the root there;
// middleware bounces unauthenticated users on to /login.
export default function Home() {
  redirect('/dashboard')
}
