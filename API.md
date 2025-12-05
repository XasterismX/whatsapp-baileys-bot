# API Документация

## Содержание

1. [Основные функции](#основные-функции)
2. [События](#события)
3. [Обработка ошибок](#обработка-ошибок)
4. [Примеры использования](#примеры-использования)

---

## Основные функции

### `startWhatsAppBot()`

Инициализирует и запускает WhatsApp бот.

**Возвращает:** `Promise<WASocket>` - объект соединения с WhatsApp

**Пример:**
```javascript
const sock = await startWhatsAppBot();
```

---

### `sendMessage(sock, phoneNumber, message)`

Отправляет текстовое сообщение указанному номеру телефона.

**Параметры:**
- `sock` (WASocket) - объект соединения WhatsApp
- `phoneNumber` (string) - номер телефона в формате без `+` (например: `79123456789`)
- `message` (string) - текст сообщения

**Возвращает:** `Promise<Object>`
```javascript
{
  success: boolean,        // true если отправлено успешно
  messageId?: string,      // ID отправленного сообщения
  timestamp?: number,      // временная метка отправки
  error?: string          // текст ошибки если success = false
}
```

**Примеры:**

✅ **Успешная отправка:**
```javascript
const result = await sendMessage(sock, '79123456789', 'Привет!');
console.log(result);
// { success: true, messageId: 'ABC123...', timestamp: 1234567890 }
```

❌ **Номер не зарегистрирован:**
```javascript
const result = await sendMessage(sock, '71111111111', 'Тест');
console.log(result);
// { success: false, error: 'Номер не зарегистрирован в WhatsApp' }
```

---

## События

### `connection.update`

Вызывается при изменении состояния соединения.

**Поля события:**
- `connection` - состояние подключения: `'open'`, `'close'`, `'connecting'`
- `lastDisconnect` - информация о последнем отключении
- `qr` - QR-код для авторизации (если требуется)

**Пример обработки:**
```javascript
sock.ev.on('connection.update', async (update) => {
  const { connection, qr } = update;
  
  if (qr) {
    console.log('Отсканируйте QR-код');
    qrcode.generate(qr, { small: true });
  }
  
  if (connection === 'open') {
    console.log('✅ Подключено!');
  }
  
  if (connection === 'close') {
    console.log('❌ Соединение закрыто');
  }
});
```

---

### `creds.update`

Вызывается при обновлении учетных данных (автоматически сохраняется).

**Пример:**
```javascript
sock.ev.on('creds.update', saveCreds);
```

---

### `messages.upsert`

Вызывается при получении новых сообщений.

**Поля события:**
- `messages` (array) - массив полученных сообщений
- `type` (string) - тип обновления: `'notify'`, `'append'`

**Структура сообщения:**
```javascript
{
  key: {
    remoteJid: '79123456789@s.whatsapp.net',  // отправитель
    fromMe: false,                              // от меня?
    id: 'message_id'                            // ID сообщения
  },
  message: {
    conversation: 'Текст сообщения'             // текст
  },
  pushName: 'Имя отправителя',                  // имя
  messageTimestamp: 1234567890                   // время
}
```

**Пример обработки:**
```javascript
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const message of messages) {
    // Игнорируем собственные сообщения
    if (message.key.fromMe) continue;

    const text = message.message?.conversation || '';
    const from = message.key.remoteJid;
    const name = message.pushName;

    console.log(`Получено от ${name}: ${text}`);
    
    // Автоответ
    await sock.sendMessage(from, { text: 'Спасибо за сообщение!' });
  }
});
```

---

## Обработка ошибок

### Проверка регистрации номера

```javascript
try {
  const [result] = await sock.onWhatsApp('79123456789');
  
  if (!result || !result.exists) {
    console.log('❌ Номер не зарегистрирован в WhatsApp');
    return;
  }
  
  console.log('✅ Номер зарегистрирован');
} catch (error) {
  console.error('Ошибка проверки:', error.message);
}
```

### Обработка отключения

```javascript
sock.ev.on('connection.update', async (update) => {
  const { connection, lastDisconnect } = update;
  
  if (connection === 'close') {
    const shouldReconnect = 
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
    
    if (shouldReconnect) {
      console.log('🔄 Переподключение...');
      await delay(3000);
      startWhatsAppBot();
    } else {
      console.log('🚪 Вышли из системы');
    }
  }
});
```

### Try-Catch для отправки сообщений

```javascript
try {
  await sendMessage(sock, '79123456789', 'Тест');
} catch (error) {
  if (error.message.includes('not registered')) {
    console.error('Номер не зарегистрирован');
  } else if (error.message.includes('timeout')) {
    console.error('Превышено время ожидания');
  } else {
    console.error('Неизвестная ошибка:', error.message);
  }
}
```

---

## Примеры использования

### 1. Простой эхо-бот

```javascript
import { startWhatsAppBot } from './index.js';

const sock = await startWhatsAppBot();

sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const msg of messages) {
    if (msg.key.fromMe) continue;

    const text = msg.message?.conversation || '';
    const from = msg.key.remoteJid;

    // Эхо: отправляем обратно то же сообщение
    await sock.sendMessage(from, { text: `Вы написали: ${text}` });
  }
});
```

### 2. Бот с командами

```javascript
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const msg of messages) {
    if (msg.key.fromMe) continue;

    const text = msg.message?.conversation || '';
    const from = msg.key.remoteJid;

    // Обработка команд
    if (text === '/help') {
      await sock.sendMessage(from, { 
        text: 'Доступные команды:\n/help - помощь\n/time - время\n/info - информация' 
      });
    }
    else if (text === '/time') {
      const now = new Date().toLocaleString('ru-RU');
      await sock.sendMessage(from, { text: `Текущее время: ${now}` });
    }
    else if (text === '/info') {
      await sock.sendMessage(from, { 
        text: 'Я бот на базе Baileys для WhatsApp' 
      });
    }
  }
});
```

### 3. Массовая рассылка

```javascript
import { sendMessage } from './index.js';
import { delay } from '@whiskeysockets/baileys';

const recipients = [
  '79123456789',
  '79987654321',
  '79111111111'
];

const message = 'Это тестовая рассылка от бота';

for (const phone of recipients) {
  const result = await sendMessage(sock, phone, message);
  
  if (result.success) {
    console.log(`✅ Отправлено ${phone}`);
  } else {
    console.log(`❌ Ошибка ${phone}: ${result.error}`);
  }
  
  // Пауза 2 секунды между сообщениями
  await delay(2000);
}
```

### 4. Сохранение истории сообщений

```javascript
import fs from 'fs/promises';

const messageHistory = [];

sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const msg of messages) {
    const record = {
      from: msg.key.remoteJid,
      name: msg.pushName,
      text: msg.message?.conversation || '',
      timestamp: new Date(msg.messageTimestamp * 1000).toISOString(),
      fromMe: msg.key.fromMe
    };
    
    messageHistory.push(record);
    
    // Сохранение в файл каждые 10 сообщений
    if (messageHistory.length % 10 === 0) {
      await fs.writeFile(
        'history.json', 
        JSON.stringify(messageHistory, null, 2)
      );
    }
  }
});
```

### 5. Отправка по расписанию

```javascript
import cron from 'node-cron';

// Отправка каждый день в 9:00
cron.schedule('0 9 * * *', async () => {
  await sendMessage(sock, '79123456789', 'Доброе утро! 🌅');
});

// Отправка каждый час
cron.schedule('0 * * * *', async () => {
  const now = new Date().toLocaleTimeString('ru-RU');
  await sendMessage(sock, '79123456789', `Текущее время: ${now}`);
});
```

---

## Полезные методы Socket

### Получение информации о пользователе

```javascript
const userInfo = sock.user;
console.log('Мой номер:', userInfo.id.split(':')[0]);
console.log('Мое имя:', userInfo.name);
```

### Отправка реакции на сообщение

```javascript
sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0];
  
  await sock.sendMessage(msg.key.remoteJid, {
    react: {
      text: '👍',
      key: msg.key
    }
  });
});
```

### Отметка сообщения как прочитанного

```javascript
await sock.readMessages([msg.key]);
```

### Получение статуса "печатает"

```javascript
await sock.sendPresenceUpdate('composing', jid);
// ... отправка сообщения ...
await sock.sendPresenceUpdate('available', jid);
```

---

## Константы и Enum

### DisconnectReason

```javascript
import { DisconnectReason } from '@whiskeysockets/baileys';

DisconnectReason.badSession       // плохая сессия
DisconnectReason.connectionClosed // соединение закрыто
DisconnectReason.connectionLost   // соединение потеряно
DisconnectReason.connectionReplaced // соединение заменено
DisconnectReason.loggedOut        // выход из системы
DisconnectReason.restartRequired  // требуется перезапуск
DisconnectReason.timedOut         // тайм-аут
```

### Browsers

```javascript
import { Browsers } from '@whiskeysockets/baileys';

Browsers.ubuntu('My Bot')       // Ubuntu браузер
Browsers.macOS('My Bot')        // macOS браузер
Browsers.windows('My Bot')      // Windows браузер
Browsers.appropriate('My Bot')  // автоопределение
```

---

## Рекомендации

### 🔒 Безопасность

1. **Никогда** не делитесь содержимым папки `auth_info/`
2. Добавьте `auth_info/` в `.gitignore`
3. Используйте переменные окружения для конфиденциальных данных
4. Регулярно проверяйте список подключенных устройств в WhatsApp

### ⚡ Производительность

1. Используйте паузы между массовыми отправками (`delay()`)
2. Не отправляйте больше 20-30 сообщений в минуту
3. Обрабатывайте ошибки gracefully
4. Используйте очереди для массовых операций

### 📝 Логирование

```javascript
const logger = P({ 
  level: 'info',  // 'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'
  timestamp: true 
});
```

### 🔄 Reconnection

```javascript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
  reconnectAttempts++;
  await delay(3000 * reconnectAttempts); // экспоненциальная задержка
  startWhatsAppBot();
}
```

---

## Типичные ошибки

### ❌ Ошибка: `Connection Closed`

**Причина:** Нестабильное соединение или слишком много запросов

**Решение:** 
```javascript
// Увеличьте таймауты
const sock = makeWASocket({
  connectTimeoutMs: 60_000,
  keepAliveIntervalMs: 10_000
});
```

### ❌ Ошибка: `Session timed out`

**Причина:** Сессия устарела или была отозвана

**Решение:** Удалите папку `auth_info/` и пересоздайте сессию

### ❌ Ошибка: `Rate limit exceeded`

**Причина:** Слишком много сообщений отправлено за короткое время

**Решение:** Добавьте задержки между отправками
```javascript
await delay(2000); // пауза 2 секунды
```

---

## Дополнительные ресурсы

- [GitHub репозиторий Baileys](https://github.com/WhiskeySockets/Baileys)
- [NPM пакет](https://www.npmjs.com/package/@whiskeysockets/baileys)
- [Примеры использования](./example.js)
