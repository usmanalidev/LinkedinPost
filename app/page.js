import { Suspense } from "react";
import HomeClient from "./home-client";

export default function Page() {
  return (
    <Suspense fallback={<main className="wrap">Loading…</main>}>
      <HomeClient />
    </Suspense>
  );
}
