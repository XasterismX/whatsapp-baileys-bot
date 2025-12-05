import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeInMemoryStore,
  Browsers,
  delay
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import qrcode from 'qrcode-terminal';

// Настройка логгера
const logger = P({ level: 'info' });

// Создание in-memory store для сохранения состояния чатов
const store = makeInMemoryStore({ logger });

// Путь для сохранения сессии
const AUTH_FOLDER = './auth_info';

/**
 * Основная функция для запуска WhatsApp бота
 */
async function startWhatsAppBot() {
  // Загрузка сохраненной сессии или создание новой
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  // Создание WebSocket соединения
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // Используем кастомный вывод QR
    logger,
    browser: Browsers.ubuntu('WhatsApp Bot'),
    // Настройки для стабильного соединения
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10_000,
    emitOwnEvents: true,
    markOnlineOnConnect: true,
  });

  // Привязка store к socket для синхронизации
  store.bind(sock.ev);

  /**
   * Обработчик обновления соединения
   */
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Отображение QR-кода для авторизации
    if (qr) {
      console.log('\n📱 Отсканируйте QR-код с помощью WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n⏳ Ожидание сканирования QR-кода...\n');
    }

    // Успешное подключение
    if (connection === 'open') {
      console.log('✅ Успешно подключено к WhatsApp!');
      console.log('📞 Номер:', sock.user.id.split(':')[0]);
      console.log('📝 Сессия сохранена в:', AUTH_FOLDER);
      
      // Пример отправки сообщения (раскомментируйте для использования)
      // await sendMessage(sock, '79123456789', 'Привет! Это тестовое сообщение.');
    }

    // Обработка отключения
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      console.log('❌ Соединение закрыто. Причина:', lastDisconnect?.error);
      
      if (shouldReconnect) {
        console.log('🔄 Переподключение...');
        await delay(3000);
        startWhatsAppBot();
      } else {
        console.log('🚪 Вышли из системы. Удалите папку auth_info для повторной авторизации.');
      }
    }
  });

  /**
   * Автоматическое сохранение учетных данных при их обновлении
   */
  sock.ev.on('creds.update', saveCreds);

  /**
   * Обработчик входящих сообщений
   */
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const message of messages) {
      // Игнорируем собственные сообщения
      if (message.key.fromMe) continue;

      const messageText = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || '';
      
      const from = message.key.remoteJid;
      const senderName = message.pushName || 'Unknown';

      console.log(`\n📨 Получено сообщение от ${senderName} (${from}):`);
      console.log(`   "${messageText}"\n`);

      // Пример автоответа (раскомментируйте для использования)
      // if (messageText.toLowerCase().includes('привет')) {
      //   await sock.sendMessage(from, { text: 'Привет! Чем могу помочь?' });
      // }
    }
  });

  return sock;
}

/**
 * Отправка текстового сообщения по номеру телефона
 * @param {object} sock - WhatsApp socket соединение
 * @param {string} phoneNumber - Номер телефона (без + и пробелов, например: 79123456789)
 * @param {string} message - Текст сообщения
 */
export async function sendMessage(sock, phoneNumber, message) {
  try {
    // Форматирование номера для WhatsApp (добавление @s.whatsapp.net)
    const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

    console.log(`\n📤 Отправка сообщения на ${phoneNumber}...`);

    // Проверка, зарегистрирован ли номер в WhatsApp
    const [result] = await sock.onWhatsApp(phoneNumber);
    
    if (!result || !result.exists) {
      console.error(`❌ Номер ${phoneNumber} не зарегистрирован в WhatsApp`);
      return {
        success: false,
        error: 'Номер не зарегистрирован в WhatsApp'
      };
    }

    // Отправка сообщения
    const sentMessage = await sock.sendMessage(jid, { text: message });
    
    console.log(`✅ Сообщение успешно отправлено!`);
    console.log(`   Кому: ${phoneNumber}`);
    console.log(`   Текст: "${message}"\n`);

    return {
      success: true,
      messageId: sentMessage.key.id,
      timestamp: sentMessage.messageTimestamp
    };

  } catch (error) {
    console.error(`❌ Ошибка при отправке сообщения:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Пример использования функции отправки сообщения
 * Раскомментируйте блок ниже и замените номер и текст
 */
/*
(async () => {
  const sock = await startWhatsAppBot();
  
  // Ждем подключения перед отправкой
  setTimeout(async () => {
    await sendMessage(sock, '79123456789', 'Тестовое сообщение от бота!');
  }, 5000);
})();
*/

// Запуск бота
startWhatsAppBot().catch(err => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});

// Обработка graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Завершение работы бота...');
  process.exit(0);
});
