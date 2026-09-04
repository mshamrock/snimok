import { customAlphabet } from "nanoid";

const alnum = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const lowerNum = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Public capture id (URL-safe, 12 chars). */
export const captureId = customAlphabet(alnum, 12);
/** Internal row ids. */
export const rowId = customAlphabet(alnum, 16);
/** Session / API token secrets. */
export const secret = customAlphabet(alnum, 48);
/** Short human-friendly device code shown in the browser. */
export const deviceCode = customAlphabet(lowerNum, 8);
