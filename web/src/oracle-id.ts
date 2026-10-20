/** The API's UUID occupies the first 16 bytes of OracleAttestation.requestId, right padded. */
export function requestUuid(word: string) {
  if (!/^0x[0-9a-f]{32}0{32}$/i.test(word)) return undefined;
  const s = word.slice(2, 34).toLowerCase();
  const uuid = `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    uuid,
  )
    ? uuid
    : undefined;
}
