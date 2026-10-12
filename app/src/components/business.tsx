"use client";

import { createContext, useContext } from "react";

export type BizCtx = { business: any; vault: any; reload: () => Promise<void> };
export const BusinessContext = createContext<BizCtx | null>(null);
export const useBusiness = () => useContext(BusinessContext)!;
