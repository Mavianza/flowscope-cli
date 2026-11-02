export declare function readJson(path: string, limit?: number): Promise<unknown>;
/** Reservasi direktori secara eksklusif; kegagalan dibersihkan tanpa menyentuh direktori lama. */
export declare function writeBundle(destination: string, files: Record<string, string>): Promise<string>;
