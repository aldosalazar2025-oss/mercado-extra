export const esDniValido = (v: string) => /^[0-9]{8}$/.test(v.trim());
export const esTelefonoValido = (v: string) => v.trim() === "" || /^9[0-9]{8}$/.test(v.trim());
export const esNombreValido = (v: string) => v.trim().length >= 5 && v.trim().includes(" ");
