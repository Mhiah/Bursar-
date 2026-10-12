import { toHex } from "viem";

/** Category name as the vault stores it (bytes32). */
export const categoryKey = (category: string) => toHex(category.trim().toLowerCase().slice(0, 31), { size: 32 });
