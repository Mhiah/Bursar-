"use client";

import { useEffect, useState } from "react";
import { useSeen } from "./motion";

const methods = [
  ["USDC on Arc", "Straight from their wallet"],
  ["EURC", "Swapped to USDC for them"],
  ["USDC on another network", "Base, Ethereum, Arbitrum…"],
];

/** A phone showing the customer pay page, cycling through the ways to pay. */
export function PayMock() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3);
  const [m, setM] = useState(0);
  const [paid, setPaid] = useState(false);
  useEffect(() => {
    if (!seen) return;
    let step = 0;
    const t = setInterval(() => {
      step = (step + 1) % 5;
      if (step < 3) {
        setPaid(false);
        setM(step);
      } else if (step === 3) setPaid(true);
    }, 1800);
    return () => clearInterval(t);
  }, [seen]);
  return (
    <div ref={ref} className="mx-auto w-[290px] rounded-[38px] border-[7px] border-site-deep bg-site-bg p-4 shadow-[0_30px_60px_-30px_rgba(17,35,26,0.5)]">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-site-deep/80" />
      <p className="text-[12px] text-site-muted">Test Bakery asks for payment</p>
      <p className="font-head text-[34px] font-bold leading-tight text-site-ink">
        300.00 <span className="text-sm font-semibold text-site-muted">USDC</span>
      </p>
      <div className="mt-2 space-y-1 border-t border-dashed border-site-line pt-2 text-[11px]">
        <div className="flex justify-between"><span className="text-site-muted">Invoice</span><span className="font-code">INV-1051</span></div>
        <div className="flex justify-between"><span className="text-site-muted">For</span><span>Weekly bread order</span></div>
      </div>
      <div className="mt-3 space-y-1.5">
        {methods.map(([t, s], i) => (
          <div key={t} className={`flex items-center justify-between rounded-xl px-3 py-2 transition-all duration-300 ${m === i ? "border-[1.5px] border-site-green bg-site-mint" : "border border-site-line bg-white"}`}>
            <span>
              <span className="block text-[12px] font-semibold text-site-ink">{t}</span>
              <span className="text-[10px] text-site-muted">{s}</span>
            </span>
            <span className={`h-3.5 w-3.5 rounded-full transition-all duration-300 ${m === i ? "border-[4px] border-site-green" : "border border-site-line"}`} />
          </div>
        ))}
      </div>
      <div className={`mt-3 rounded-full py-2.5 text-center text-[12px] font-semibold text-white transition-colors duration-300 ${paid ? "bg-site-green" : "bg-site-deep"}`}>
        {paid ? "✓ Paid, thank you" : "Pay 300.00"}
      </div>
      <p className="mt-2 text-center text-[10px] text-site-muted">Goes straight to their vault. Bursar never holds it.</p>
    </div>
  );
}
