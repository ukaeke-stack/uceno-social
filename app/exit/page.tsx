import Link from "next/link";
export default function ExitPage() {
  return <main className="exit-screen"><section className="exit-screen-card"><img src="/icons/uceno.svg" alt="UCENO app icon"/><h1>You’ve left UCENO</h1><p>This screen is ready. Your browser or Android app stays open because websites cannot close it directly.</p><Link href="/account">Return to UCENO <span aria-hidden="true">↗</span></Link></section></main>;
}
