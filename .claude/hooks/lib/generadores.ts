// Generadores para las pruebas de los controles. Ningún valor con forma real se escribe
// literal en el repositorio (FR-018): se arma en tiempo de ejecución.

/** Dígito de control Luhn para una base de dígitos. */
export function digitoLuhn(base: string): string {
  let suma = 0;
  for (let i = 0; i < base.length; i++) {
    let d = Number(base[base.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return String((10 - (suma % 10)) % 10);
}

/** Tarjeta de 16 dígitos que pasa Luhn, generada a partir de una base de 15. */
export function tarjetaLuhn(): string {
  const base = "4" + "5".repeat(3) + "2".repeat(4) + "7".repeat(7);
  return base + digitoLuhn(base);
}

/** Separa los dígitos en bloques de 4. */
export function enBloques(digitos: string, separador: string): string {
  return (digitos.match(/.{1,4}/g) ?? []).join(separador);
}
