/**
 * Примеры использования WhatsApp бота
 * 
 * Этот файл содержит примеры того, как можно использовать бота.
 * Для запуска: node example.js
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  delay
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import qrcode from 'qrcode-terminal';

const logger = P({ level: 'silent' }); // Отключаем логи Baileys
const AUTH_FOLDER = './auth_info';

/**
 * Пример 1: Отправка одного сообщения
 */
async function example1_sendSingleMessage() {
  console.log('\n=== Пример 1: Отправка одного сообщения ===\n');
  
  const sock = await connectWhatsApp();
  
  // Ждем подключения
  await new Promise(resolve => {
    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'open') resolve();
    });
  });
  
  // Замените на ваш номер
  const phoneNumber = '79123456789';
  const message = 'Привет! Это тестовое сообщение от бота.';
  
  const result = await sendMessage(sock, phoneNumber, message);
  console.log('Результат:', result);
}

/**
 * Пример 2: Отправка нескольких сообщений
 */
async function example2_sendMultipleMessages() {
  console.log('\n=== Пример 2: Отправка нескольких сообщений ===\n');
  
  const sock = await connectWhatsApp();
  
  await new Promise(resolve => {
    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'open') resolve();
    });
  });
  
  const messages = [
    { phone: '79123456789', text: 'Первое сообщение' },
    { phone: '79123456789', text: 'Второе сообщение' },
    { phone: '79987654321', text: 'Сообщение другому пользователю' }
  ];
  
  for (const msg of messages) {
    await sendMessage(sock, msg.phone, msg.text);
    // Пауза между сообщениями чтобы не попасть в спам
    await delay(2000);
  }
}

/**
 * Пример 3: Автоответчик на сообщения
 */
async function example3_autoResponder() {
  console.log('\n=== Пример 3: Автоответчик ===\n');
  console.log('Бот запущен и ждет сообщений...\n');
  
  const sock = await connectWhatsApp();
  
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const message of messages) {
      if (message.key.fromMe) continue;

      const messageText = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || '';
      const from = message.key.remoteJid;
      const senderName = message.pushName || 'Unknown';

      console.log(`📨 Получено от ${senderName}: "${messageText}"`);

      // Логика автоответа
      if (messageText.toLowerCase().includes('привет')) {
        await sock.sendMessage(from, { text: 'Привет! Чем могу помочь?' });
      } 
      else if (messageText.toLowerCase().includes('помощь')) {
        await sock.sendMessage(from, { 
          text: 'Доступные команды:\n• "привет" - приветствие\n• "помощь" - список команд\n• "время" - текущее время' 
        });
      }
      else if (messageText.toLowerCase().includes('время')) {
        const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
        await sock.sendMessage(from, { text: `Текущее время: ${now}` });
      }
    }
  });
}

/**
 * Пример 4: Проверка регистрации номеров
 */
async function example4_checkNumbers() {
  console.log('\n=== Пример 4: Проверка номеров ===\n');
  
  const sock = await connectWhatsApp();
  
  await new Promise(resolve => {
    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'open') resolve();
    });
  });
  
  const numbersToCheck = [
    '79123456789',
    '79987654321',
    '71234567890'  // Несуществующий номер
  ];
  
  for (const number of numbersToCheck) {
    const [result] = await sock.onWhatsApp(number);
    
    if (result && result.exists) {
      console.log(`✅ ${number} - зарегистрирован в WhatsApp`);
    } else {
      console.log(`❌ ${number} - НЕ зарегистрирован`);
    }
  }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: Browsers.ubuntu('WhatsApp Bot Example'),
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10_000,
    emitOwnEvents: true,
    markOnlineOnConnect: true,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Отсканируйте QR-код:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n');
    }

    if (connection === 'open') {
      console.log('✅ Подключено к WhatsApp');
      console.log(`📞 Номер: ${sock.user.id.split(':')[0]}\n`);
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      if (shouldReconnect) {
        console.log('🔄 Переподключение...');
        await delay(3000);
        return connectWhatsApp();
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  
  return sock;
}

async function sendMessage(sock, phoneNumber, message) {
  try {
    const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

    const [result] = await sock.onWhatsApp(phoneNumber);
    
    if (!result || !result.exists) {
      console.error(`❌ ${phoneNumber} не зарегистрирован в WhatsApp`);
      return { success: false, error: 'Номер не зарегистрирован' };
    }

    const sentMessage = await sock.sendMessage(jid, { text: message });
    
    console.log(`✅ Сообщение отправлено на ${phoneNumber}`);

    return {
      success: true,
      messageId: sentMessage.key.id,
      timestamp: sentMessage.messageTimestamp
    };

  } catch (error) {
    console.error(`❌ Ошибка: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ========== ЗАПУСК ПРИМЕРОВ ==========

// Раскомментируйте нужный пример:

// example1_sendSingleMessage();
// example2_sendMultipleMessages();
example3_autoResponder();
// example4_checkNumbers();
