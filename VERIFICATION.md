# Pemeriksaan aktual FlowScope

Tanggal: 3 November 2026 (Asia/Makassar).

Lingkungan: Linux, Node.js v24.22.1, npm 11.9.0, TypeScript 5.9.3, `@types/node` 22.18.0. Aplikasi memerlukan Node.js 22+, tetapi eksekusi pengujian ini menggunakan Node.js 24; Windows dan macOS belum diuji secara langsung.

| Pemeriksaan | Hasil aktual |
| --- | --- |
| `npm run typecheck` | Lulus, TypeScript strict dan `noUncheckedIndexedAccess`, tanpa error |
| `npm test` | 53 tes lulus, 0 gagal, 0 dilewati; membangun ulang JavaScript sebelum tes |
| Oracle pada 400 graf acak | Nilai solver cocok dengan minimum dari enumerasi seluruh cut pada setiap graf 2–7 simpul; semua sertifikat juga sah |
| Residual balik | Kasus penugasan memaksa pembatalan aliran sisi yang telah dipakai; total akhir 2, bukan 1 |
| Alur CLI end-to-end | 9 tes integrasi, termasuk solve → file laporan → verifikasi dasar/skenario, manipulasi hasil, dan penolakan input/output yang bermasalah |
| `npm run verify:package` | Pack, pemasangan tarball lokal secara offline dengan script dimatikan, serta CLI dari dalam `node_modules` lulus; versi, solve, skenario, verify, dan SVG diperiksa |
| Contoh distribusi logistik | Aliran dasar 23 paket/jam, minimum cut 23, 3 augmentasi; skenario `DT=10` menghasilkan 26 paket/jam, selisih +3 |
| Laporan contoh | SVG dirender menjadi PNG 1120 × 1297 dan diperiksa secara visual; label sisi antiparalel dipisahkan agar terbaca |

Paket npm yang diuji tidak memasukkan `node_modules` dan tidak memerlukan dependensi runtime. Pemeriksaan renderer PNG memakai Sharp yang tersedia pada lingkungan pengerjaan; Sharp bukan dependensi aplikasi. Aplikasi hanya menghasilkan SVG dan JSON.

Tes oracle tidak menggunakan solver lain atau hasil yang disalin dari implementasi: oracle mengenumerasi semua partisi yang memisahkan source dan sink, lalu menjumlahkan kapasitas sisi yang melintasinya. Verifier produksi memeriksa kelayakan dan kesamaan flow–cut, serta replay residual, tanpa memanggil solver.

Catatan batas cakupan: pengujian ini tidak menguji performa jaringan nyata karena aplikasi merupakan analisis graf offline. Rendering telah diperiksa pada contoh yang disertakan; graf padat dapat memiliki garis berpotongan, sehingga tabel dan JSON dipertahankan sebagai rincian lengkap.
