export const soles = (n: number) => `S/ ${n.toFixed(2)}`;
export const km = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`);
