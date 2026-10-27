/** "1 item", "3 items". Pass the plural when it isn't just an added "s". */
export const count = (n: number, word: string, plural = `${word}s`): string => `${n} ${n === 1 ? word : plural}`

/** The word on its own, singular for 1: "arrow" or "arrows". */
export const plural = (n: number, word: string, many = `${word}s`): string => (n === 1 ? word : many)
