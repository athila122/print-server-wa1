import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pdf from 'pdf-parse';
import fs from 'fs';
import { Boom } from '@hapi/boom';
// Import 'qrcode-terminal' untuk menampilkan QR
import qrcode from 'qrcode-terminal'; 
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';

const app = express();
const PORT = 3000;
let isServerRunning = false; 

// Middleware (Tetap Sama)
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Multer (Tetap Sama)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Fungsi Start WA Socket (Tetap Sama)
const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();

  console.log('Menghubungkan ke WhatsApp...');
  
  const sock = makeWASocket({
    version,
    auth: state,
    browser: ['Website Print', 'Chrome', '10.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update || {};

    if (qr) {
      console.log('=========================================');
      console.log('       SILAKAN SCAN QR DI BAWAH INI       ');
      console.log('=========================================');
      qrcode.generate(qr, { small: true });
      console.log('^ Scan QR di atas untuk login ^');
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log('Koneksi terputus, mencoba menyambung ulang...');
        startSock();
      } else {
        console.log('Koneksi ditutup. Anda sudah logout. Hapus folder auth dan restart.');
        isServerRunning = false;
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp Terhubung!');
      console.log('Info User ID:', sock.user?.id); 

      if (!isServerRunning) {
        
        // API: CEK HALAMAN (Tetap Sama)
        app.post('/check-pages', upload.single('file'), async (req, res) => {
          // ... (Kode cek halaman tetap sama) ...
          try {
            if (!req.file) return res.json({ ok: false, message: 'Tidak ada file' });
            const buffer = req.file.buffer;
            let halamanCount = 1;
            const text = buffer.toString('latin1');
            const matches = text.match(/\/Count\s+(\d+)/);
            if (matches) {
              halamanCount = parseInt(matches[1]);
            } else {
              try {
                const data = await pdf(buffer);
                halamanCount = data.numpages;
              } catch (parseErr) {
                halamanCount = 1;
              }
            }
            res.json({ ok: true, halaman: halamanCount });
          } catch (err) {
            res.json({ ok: false, message: err.message });
          }
        });

        // ============================================
        // API: KIRIM PESAN (INI YANG DIMODIF)
        // ============================================
        app.post('/send-order', upload.single('file'), async (req, res) => {
          try {
            // =======================================
            // 1. Ambil 'nomorWaCustomer' dari req.body
            // =======================================
            const { kertas, ukuran, warna, jumlah, halaman, total, nomorWaCustomer } = req.body;
            const file = req.file;

            if (!file) {
              return res.json({ ok: false, message: 'File tidak ditemukan' });
            }
            if (!sock.user || !sock.user.id) {
              console.log('❌ Gagal kirim: Socket belum siap.');
              return res.json({ ok: false, message: 'WhatsApp socket not ready.' });
            }

            // Nomor Abang (Pastikan sudah diganti)
            const nomorTujuan = '6289676960044@s.whatsapp.net'; 
            
            if (nomorTujuan === '62XXXXXXXXXX@s.whatsapp.net') {
              console.error('❌ HARAP GANTI nomorTujuan di server.js!');
              return res.json({ ok: false, message: 'Nomor tujuan WA belum diatur di server.' });
            }

            // =======================================
            // 2. Tambahkan 'nomorWaCustomer' ke template pesan
            // =======================================
            const pesan = 
`🖨️ *Pesanan Baru Masuk!*

👤 *Dari (Customer):* ${nomorWaCustomer}

📄 *Jenis Kertas:* ${kertas.toUpperCase()}
🎨 *Warna Cetak:* ${warna}
📑 *Jumlah Halaman:* ${halaman}
🧾 *Jumlah Cetak:* ${jumlah}
💰 *Total Harga:* ${total}
📏 *Ukuran:* ${ukuran}

Mohon segera dikonfirmasi 🙏`;

            // 3. Kirim pesan (Tetap Sama)
            await sock.sendMessage(nomorTujuan, { text: pesan });

            await sock.sendMessage(nomorTujuan, {
              document: file.buffer,
              fileName: file.originalname,
              mimetype: file.mimetype
            });

            console.log('✅ Pesanan berhasil dikirim ke WhatsApp');
            res.json({ ok: true });
          } catch (err) {
            console.error('❌ Gagal kirim ke WhatsApp:', err);
            res.json({ ok: false, message: err.message });
          }
        });


        // JALANKAN SERVER (Tetap Sama)
        app.listen(PORT, () => console.log(`🚀 Server jalan di http://localhost:${PORT}`));
        isServerRunning = true; 
      }
    }
  });
};

// MULAI APLIKASI (Tetap Sama)
console.log('Memulai aplikasi...');
startSock();