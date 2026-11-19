'use strict';

/** Listener texts per channel language; "rtl" marks right-to-left scripts. */
const TEXTS = {
  de: {
    name: 'Deutsch', tap: 'Tippen Sie auf den großen Knopf, um zuzuhören.', playing: 'Sie hören jetzt zu. Zum Beenden noch einmal tippen.',
    connecting: 'Verbindung wird hergestellt …', waiting: 'Die Übertragung hat noch nicht begonnen. Bitte warten – es geht automatisch los.',
    live: 'Live', offline: 'Nicht aktiv', listen: 'Zuhören', stop: 'Beenden', change: 'Kanal wechseln', choose: 'Bitte wählen Sie einen Kanal',
    noChannels: 'Zurzeit ist kein Kanal verfügbar.', error: 'Verbindung unterbrochen. Neuer Versuch …',
    unsupported: 'Dieser Browser wird nicht unterstützt. Bitte verwenden Sie Chrome, Safari oder Firefox.', theme: 'Hell / Dunkel umschalten',
  },
  en: {
    name: 'English', tap: 'Tap the big button to listen.', playing: 'You are listening now. Tap again to stop.',
    connecting: 'Connecting …', waiting: 'The broadcast has not started yet. Please wait – it will start automatically.',
    live: 'Live', offline: 'Not active', listen: 'Listen', stop: 'Stop', change: 'Change channel', choose: 'Please choose a channel',
    noChannels: 'No channel is available right now.', error: 'Connection lost. Trying again …',
    unsupported: 'This browser is not supported. Please use Chrome, Safari or Firefox.', theme: 'Switch light / dark',
  },
  ru: {
    name: 'Русский', tap: 'Нажмите на большую кнопку, чтобы слушать.', playing: 'Вы слушаете. Чтобы остановить, нажмите ещё раз.',
    connecting: 'Подключение …', waiting: 'Трансляция ещё не началась. Пожалуйста, подождите – она начнётся автоматически.',
    live: 'В эфире', offline: 'Не активно', listen: 'Слушать', stop: 'Остановить', change: 'Сменить канал', choose: 'Пожалуйста, выберите канал',
    noChannels: 'Сейчас нет доступных каналов.', error: 'Связь прервана. Повторная попытка …',
    unsupported: 'Этот браузер не поддерживается. Пожалуйста, используйте Chrome, Safari или Firefox.', theme: 'Светлая / тёмная тема',
  },
  uk: {
    name: 'Українська', tap: 'Натисніть на велику кнопку, щоб слухати.', playing: 'Ви слухаєте. Щоб зупинити, натисніть ще раз.',
    connecting: 'Підключення …', waiting: 'Трансляція ще не почалася. Будь ласка, зачекайте – вона почнеться автоматично.',
    live: 'В ефірі', offline: 'Не активно', listen: 'Слухати', stop: 'Зупинити', change: 'Змінити канал', choose: 'Будь ласка, виберіть канал',
    noChannels: 'Зараз немає доступних каналів.', error: 'З’єднання перервано. Повторна спроба …',
    unsupported: 'Цей браузер не підтримується. Будь ласка, використовуйте Chrome, Safari або Firefox.', theme: 'Світла / темна тема',
  },
  fa: {
    rtl: true, name: 'فارسی', tap: 'برای گوش دادن، دکمهٔ بزرگ را لمس کنید.', playing: 'اکنون در حال گوش دادن هستید. برای توقف دوباره لمس کنید.',
    connecting: 'در حال اتصال …', waiting: 'پخش هنوز شروع نشده است. لطفاً صبر کنید – به‌طور خودکار شروع می‌شود.',
    live: 'زنده', offline: 'غیرفعال', listen: 'گوش دادن', stop: 'توقف', change: 'تغییر کانال', choose: 'لطفاً یک کانال انتخاب کنید',
    noChannels: 'در حال حاضر هیچ کانالی در دسترس نیست.', error: 'اتصال قطع شد. تلاش دوباره …',
    unsupported: 'این مرورگر پشتیبانی نمی‌شود. لطفاً از Chrome، Safari یا Firefox استفاده کنید.', theme: 'تغییر حالت روشن / تیره',
  },
  ar: {
    rtl: true, name: 'العربية', tap: 'اضغط على الزر الكبير للاستماع.', playing: 'أنت تستمع الآن. اضغط مرة أخرى للإيقاف.',
    connecting: 'جارٍ الاتصال …', waiting: 'لم يبدأ البث بعد. يرجى الانتظار – سيبدأ تلقائيًا.',
    live: 'مباشر', offline: 'غير نشط', listen: 'استمع', stop: 'إيقاف', change: 'تغيير القناة', choose: 'يرجى اختيار قناة',
    noChannels: 'لا توجد قناة متاحة حاليًا.', error: 'انقطع الاتصال. جارٍ إعادة المحاولة …',
    unsupported: 'هذا المتصفح غير مدعوم. يرجى استخدام Chrome أو Safari أو Firefox.', theme: 'الوضع الفاتح / الداكن',
  },
  he: {
    rtl: true, name: 'עברית', tap: 'הקישו על הכפתור הגדול כדי להאזין.', playing: 'אתם מאזינים כעת. הקישו שוב כדי להפסיק.',
    connecting: 'מתחבר …', waiting: 'השידור עדיין לא התחיל. אנא המתינו – הוא יתחיל אוטומטית.',
    live: 'בשידור חי', offline: 'לא פעיל', listen: 'האזנה', stop: 'עצירה', change: 'החלפת ערוץ', choose: 'אנא בחרו ערוץ',
    noChannels: 'אין כרגע ערוץ זמין.', error: 'החיבור נותק. מנסה שוב …',
    unsupported: 'דפדפן זה אינו נתמך. אנא השתמשו ב-Chrome, Safari או Firefox.', theme: 'מצב בהיר / כהה',
  },
  tr: {
    name: 'Türkçe', tap: 'Dinlemek için büyük düğmeye dokunun.', playing: 'Şu anda dinliyorsunuz. Durdurmak için tekrar dokunun.',
    connecting: 'Bağlanıyor …', waiting: 'Yayın henüz başlamadı. Lütfen bekleyin – otomatik olarak başlayacak.',
    live: 'Canlı', offline: 'Etkin değil', listen: 'Dinle', stop: 'Durdur', change: 'Kanal değiştir', choose: 'Lütfen bir kanal seçin',
    noChannels: 'Şu anda kullanılabilir kanal yok.', error: 'Bağlantı kesildi. Yeniden deneniyor …',
    unsupported: 'Bu tarayıcı desteklenmiyor. Lütfen Chrome, Safari veya Firefox kullanın.', theme: 'Açık / koyu tema',
  },
  ro: {
    name: 'Română', tap: 'Atingeți butonul mare pentru a asculta.', playing: 'Acum ascultați. Atingeți din nou pentru a opri.',
    connecting: 'Se conectează …', waiting: 'Transmisiunea nu a început încă. Vă rugăm să așteptați – va porni automat.',
    live: 'Live', offline: 'Inactiv', listen: 'Ascultă', stop: 'Oprește', change: 'Schimbă canalul', choose: 'Vă rugăm să alegeți un canal',
    noChannels: 'Momentan nu este disponibil niciun canal.', error: 'Conexiune întreruptă. Se reîncearcă …',
    unsupported: 'Acest browser nu este acceptat. Vă rugăm să folosiți Chrome, Safari sau Firefox.', theme: 'Temă deschisă / închisă',
  },
  pl: {
    name: 'Polski', tap: 'Dotknij dużego przycisku, aby słuchać.', playing: 'Słuchasz teraz. Dotknij ponownie, aby zatrzymać.',
    connecting: 'Łączenie …', waiting: 'Transmisja jeszcze się nie rozpoczęła. Proszę czekać – rozpocznie się automatycznie.',
    live: 'Na żywo', offline: 'Nieaktywny', listen: 'Słuchaj', stop: 'Zatrzymaj', change: 'Zmień kanał', choose: 'Wybierz kanał',
    noChannels: 'Obecnie żaden kanał nie jest dostępny.', error: 'Połączenie przerwane. Ponowna próba …',
    unsupported: 'Ta przeglądarka nie jest obsługiwana. Użyj Chrome, Safari lub Firefox.', theme: 'Motyw jasny / ciemny',
  },
  es: {
    name: 'Español', tap: 'Toque el botón grande para escuchar.', playing: 'Ahora está escuchando. Toque de nuevo para detener.',
    connecting: 'Conectando …', waiting: 'La transmisión aún no ha comenzado. Espere, por favor – empezará automáticamente.',
    live: 'En directo', offline: 'No activo', listen: 'Escuchar', stop: 'Detener', change: 'Cambiar canal', choose: 'Por favor, elija un canal',
    noChannels: 'No hay ningún canal disponible en este momento.', error: 'Conexión interrumpida. Reintentando …',
    unsupported: 'Este navegador no es compatible. Use Chrome, Safari o Firefox.', theme: 'Tema claro / oscuro',
  },
  fr: {
    name: 'Français', tap: 'Appuyez sur le grand bouton pour écouter.', playing: 'Vous écoutez maintenant. Appuyez à nouveau pour arrêter.',
    connecting: 'Connexion …', waiting: 'La diffusion n’a pas encore commencé. Veuillez patienter – elle démarrera automatiquement.',
    live: 'En direct', offline: 'Inactif', listen: 'Écouter', stop: 'Arrêter', change: 'Changer de canal', choose: 'Veuillez choisir un canal',
    noChannels: 'Aucun canal n’est disponible pour le moment.', error: 'Connexion interrompue. Nouvelle tentative …',
    unsupported: 'Ce navigateur n’est pas pris en charge. Veuillez utiliser Chrome, Safari ou Firefox.', theme: 'Thème clair / sombre',
  },
  hy: {
    name: 'Հայերեն', tap: 'Լսելու համար հպեք մեծ կոճակին։', playing: 'Դուք հիմա լսում եք։ Կանգնեցնելու համար կրկին հպեք։',
    connecting: 'Միացում …', waiting: 'Հեռարձակումը դեռ չի սկսվել։ Խնդրում ենք սպասել – այն կսկսվի ինքնաբերաբար։',
    live: 'Ուղիղ եթեր', offline: 'Ակտիվ չէ', listen: 'Լսել', stop: 'Կանգնեցնել', change: 'Փոխել ալիքը', choose: 'Խնդրում ենք ընտրել ալիք',
    noChannels: 'Այս պահին հասանելի ալիք չկա։', error: 'Կապը խզվեց։ Նոր փորձ …',
    unsupported: 'Այս դիտարկիչը չի աջակցվում։ Խնդրում ենք օգտագործել Chrome, Safari կամ Firefox։', theme: 'Բաց / մուգ ռեժիմ',
  },
  ka: {
    name: 'ქართული', tap: 'მოსასმენად შეეხეთ დიდ ღილაკს.', playing: 'ახლა უსმენთ. შესაჩერებლად კვლავ შეეხეთ.',
    connecting: 'მიმდინარეობს დაკავშირება …', waiting: 'ტრანსლაცია ჯერ არ დაწყებულა. გთხოვთ, დაელოდოთ – ის ავტომატურად დაიწყება.',
    live: 'პირდაპირ ეთერში', offline: 'არ არის აქტიური', listen: 'მოსმენა', stop: 'შეჩერება', change: 'არხის შეცვლა', choose: 'გთხოვთ, აირჩიოთ არხი',
    noChannels: 'ამჟამად არცერთი არხი არ არის ხელმისაწვდომი.', error: 'კავშირი გაწყდა. ხელახალი ცდა …',
    unsupported: 'ეს ბრაუზერი არ არის მხარდაჭერილი. გთხოვთ, გამოიყენოთ Chrome, Safari ან Firefox.', theme: 'ღია / მუქი რეჟიმი',
  },
};

/** Returns the texts for a language, falling back to German. */
function texts(language) {
  return TEXTS[language] || TEXTS.de;
}

/** Returns the best browser language contained in the given text table, or German. */
function browserLanguage(table = TEXTS) {
  for (const tag of navigator.languages || [navigator.language]) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (table[code]) return code;
  }
  return 'de';
}

/** Languages of the admin interface. */
const ADMIN_LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Українська' },
];

const ADMIN_TEXTS = {
  de: {
    appTitle: 'Verwaltung', addChannel: 'Kanal hinzufügen', settings: 'Einstellungen', close: 'Schließen',
    channels: 'Kanäle', stats: 'Statistik', login: 'Anmelden', adminPassword: 'Admin-Passwort',
    insecure: 'Senden ist nur direkt am Server-Computer möglich (Adresse http://localhost) oder über eine HTTPS-Verbindung. Kanäle verwalten und die Statistik ansehen geht von überall.',
    noPassword: 'Es ist kein Admin-Passwort gesetzt. Jeder im Netzwerk kann diese Seite bedienen. Über das Zahnrad oben rechts (Einstellungen) können Sie ein Passwort festlegen.',
    channel: 'Kanal', period: 'Zeitraum', last30: 'Letzte 30 Tage', last90: 'Letzte 90 Tage', lastYear: 'Letztes Jahr', allChannels: 'Alle Kanäle zusammen',
    perDay: 'Durchschnittlich verbundene Zuhörer pro Tag', statsEmpty: 'Noch keine Daten. Die Statistik wird jede Minute erfasst, während auf einem Kanal gesendet wird.',
    average: 'Durchschnitt', maximum: 'Höchstwert', perWeekday: 'Durchschnitt nach Wochentag', allDays: 'Alle Tage',
    date: 'Datum', day: 'Tag', avgListeners: 'Ø Zuhörer', airtime: 'Sendezeit',
    appearance: 'Darstellung', dark: 'Dunkel', light: 'Hell', uiLanguage: 'Sprache',
    listenerAddress: 'Adresse für Zuhörer', listenerAddressHint: 'Diese Adresse im Browser des Handys eingeben (das Handy muss im selben WLAN sein):', noAddress: 'Keine Netzwerkverbindung gefunden.',
    heading: 'Überschrift', headingHint: 'Wird oben auf der Seite der Zuhörer angezeigt', save: 'Speichern',
    passwordSet: 'Ein Passwort ist gesetzt.', passwordNotSet: 'Es ist kein Passwort gesetzt – die Verwaltung ist für alle im Netzwerk offen.',
    newPassword: 'Neues Passwort (mindestens 4 Zeichen)', removePassword: 'Passwort entfernen', savePassword: 'Passwort speichern', logout: 'Abmelden',
    newChannel: 'Neuer Kanal', editChannel: 'Kanal bearbeiten', channelName: 'Name (z. B. „Russische Übersetzung“)', spokenLanguage: 'Gesprochene Sprache', cancel: 'Abbrechen',
    audioSource: 'Audioquelle', audioInput: 'Audioeingang {n}', startSending: 'Senden starten', stopSending: 'Senden beenden',
    mixer: 'Mischpult-Eingang (ohne Filter des Browsers)', mixerHint: 'Für ein Kabel vom Mischpult: schaltet Echounterdrückung, Rauschfilter und automatische Lautstärke des Browsers ab.',
    edit: 'Bearbeiten', reloadListeners: 'Zuhörer neu laden', delete: 'Löschen', listeners: 'Zuhörer',
    sending: 'Sendet', sendingElsewhere: 'Sendet (anderes Gerät)', connecting: 'Verbinde …', off: 'Aus',
    noAudioAccess: 'Kein Zugriff auf Audioeingänge. Bitte im Browser erlauben.', deviceGone: 'Die Audioquelle wurde getrennt.', micDenied: 'Zugriff auf das Mikrofon wurde verweigert.',
    saved: 'Gespeichert.', passwordSaved: 'Passwort gespeichert.', passwordRemoved: 'Passwort entfernt.', loginAgain: 'Bitte neu anmelden.',
    confirmReload: 'Die Seite bei allen Zuhörern dieses Kanals neu laden? Die Zuhörer müssen danach erneut auf „Abspielen“ tippen.',
    confirmDelete: 'Kanal „{name}“ wirklich löschen?', confirmRemovePassword: 'Passwort entfernen? Danach kann jeder im Netzwerk die Verwaltung bedienen.',
    weekdays: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'], weekdaysShort: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    languages: { de: 'Deutsch', en: 'Englisch', ru: 'Russisch', uk: 'Ukrainisch', fa: 'Persisch (Farsi)', ar: 'Arabisch', he: 'Hebräisch', tr: 'Türkisch', ro: 'Rumänisch', pl: 'Polnisch', es: 'Spanisch', fr: 'Französisch', hy: 'Armenisch', ka: 'Georgisch' },
    errors: {
      not_logged_in: 'Nicht angemeldet.', wrong_password: 'Falsches Passwort.', too_many_attempts: 'Zu viele Fehlversuche. Bitte eine Minute warten.',
      channel_not_found: 'Kanal nicht gefunden.', invalid_name: 'Der Name muss 1 bis 60 Zeichen lang sein.', invalid_language: 'Unbekannte Sprache.',
      invalid_title: 'Die Überschrift darf höchstens 60 Zeichen lang sein.', password_too_short: 'Das Passwort muss mindestens 4 Zeichen lang sein.',
      already_live: 'Auf diesem Kanal wird bereits gesendet.', not_publisher: 'Dieses Gerät sendet nicht auf dem Kanal.', unknown_transport: 'Verbindung unbekannt. Bitte erneut versuchen.',
      audio_only: 'Nur Audio wird unterstützt.', cannot_consume: 'Der Browser kann den Stream nicht abspielen.', timeout: 'Der Server antwortet nicht.',
    },
  },
  ru: {
    appTitle: 'Управление', addChannel: 'Добавить канал', settings: 'Настройки', close: 'Закрыть',
    channels: 'Каналы', stats: 'Статистика', login: 'Войти', adminPassword: 'Пароль администратора',
    insecure: 'Передача возможна только прямо на компьютере-сервере (адрес http://localhost) или через HTTPS. Управлять каналами и смотреть статистику можно откуда угодно.',
    noPassword: 'Пароль администратора не задан. Любой в сети может пользоваться этой страницей. Задать пароль можно через шестерёнку справа вверху (Настройки).',
    channel: 'Канал', period: 'Период', last30: 'Последние 30 дней', last90: 'Последние 90 дней', lastYear: 'Последний год', allChannels: 'Все каналы вместе',
    perDay: 'Среднее число слушателей в день', statsEmpty: 'Данных пока нет. Статистика записывается каждую минуту, пока идёт трансляция на каком-либо канале.',
    average: 'Среднее', maximum: 'Максимум', perWeekday: 'Среднее по дням недели', allDays: 'Все дни',
    date: 'Дата', day: 'День', avgListeners: 'Ø слушателей', airtime: 'Время эфира',
    appearance: 'Оформление', dark: 'Тёмное', light: 'Светлое', uiLanguage: 'Язык',
    listenerAddress: 'Адрес для слушателей', listenerAddressHint: 'Введите этот адрес в браузере телефона (телефон должен быть в той же сети Wi-Fi):', noAddress: 'Сетевое подключение не найдено.',
    heading: 'Заголовок', headingHint: 'Показывается вверху страницы слушателей', save: 'Сохранить',
    passwordSet: 'Пароль задан.', passwordNotSet: 'Пароль не задан – управление открыто для всех в сети.',
    newPassword: 'Новый пароль (не менее 4 символов)', removePassword: 'Удалить пароль', savePassword: 'Сохранить пароль', logout: 'Выйти',
    newChannel: 'Новый канал', editChannel: 'Изменить канал', channelName: 'Название (например, «Русский перевод»)', spokenLanguage: 'Язык речи', cancel: 'Отмена',
    audioSource: 'Источник звука', audioInput: 'Аудиовход {n}', startSending: 'Начать передачу', stopSending: 'Остановить передачу',
    mixer: 'Вход с микшерного пульта (без фильтров браузера)', mixerHint: 'Для кабеля от микшерного пульта: отключает эхоподавление, шумоподавление и автоматическую громкость браузера.',
    edit: 'Изменить', reloadListeners: 'Перезагрузить у слушателей', delete: 'Удалить', listeners: 'Слушатели',
    sending: 'В эфире', sendingElsewhere: 'В эфире (другое устройство)', connecting: 'Подключение …', off: 'Выкл.',
    noAudioAccess: 'Нет доступа к аудиовходам. Разрешите доступ в браузере.', deviceGone: 'Источник звука отключён.', micDenied: 'Доступ к микрофону запрещён.',
    saved: 'Сохранено.', passwordSaved: 'Пароль сохранён.', passwordRemoved: 'Пароль удалён.', loginAgain: 'Пожалуйста, войдите снова.',
    confirmReload: 'Перезагрузить страницу у всех слушателей этого канала? После этого слушателям нужно снова нажать «Воспроизвести».',
    confirmDelete: 'Действительно удалить канал «{name}»?', confirmRemovePassword: 'Удалить пароль? После этого любой в сети сможет пользоваться управлением.',
    weekdays: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'], weekdaysShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    languages: { de: 'Немецкий', en: 'Английский', ru: 'Русский', uk: 'Украинский', fa: 'Персидский (фарси)', ar: 'Арабский', he: 'Иврит', tr: 'Турецкий', ro: 'Румынский', pl: 'Польский', es: 'Испанский', fr: 'Французский', hy: 'Армянский', ka: 'Грузинский' },
    errors: {
      not_logged_in: 'Вы не вошли в систему.', wrong_password: 'Неверный пароль.', too_many_attempts: 'Слишком много неудачных попыток. Подождите минуту.',
      channel_not_found: 'Канал не найден.', invalid_name: 'Название должно содержать от 1 до 60 символов.', invalid_language: 'Неизвестный язык.',
      invalid_title: 'Заголовок может содержать не более 60 символов.', password_too_short: 'Пароль должен содержать не менее 4 символов.',
      already_live: 'На этом канале уже идёт передача.', not_publisher: 'Это устройство не ведёт передачу на этом канале.', unknown_transport: 'Неизвестное соединение. Попробуйте ещё раз.',
      audio_only: 'Поддерживается только звук.', cannot_consume: 'Браузер не может воспроизвести поток.', timeout: 'Сервер не отвечает.',
    },
  },
  en: {
    appTitle: 'Administration', addChannel: 'Add channel', settings: 'Settings', close: 'Close',
    channels: 'Channels', stats: 'Statistics', login: 'Sign in', adminPassword: 'Admin password',
    insecure: 'Sending only works directly on the server computer (address http://localhost) or over an HTTPS connection. Managing channels and viewing statistics works from anywhere.',
    noPassword: 'No admin password is set. Anyone on the network can use this page. You can set a password via the gear icon at the top right (Settings).',
    channel: 'Channel', period: 'Period', last30: 'Last 30 days', last90: 'Last 90 days', lastYear: 'Last year', allChannels: 'All channels combined',
    perDay: 'Average connected listeners per day', statsEmpty: 'No data yet. Statistics are recorded every minute while a channel is broadcasting.',
    average: 'Average', maximum: 'Maximum', perWeekday: 'Average by weekday', allDays: 'All days',
    date: 'Date', day: 'Day', avgListeners: 'Ø listeners', airtime: 'Airtime',
    appearance: 'Appearance', dark: 'Dark', light: 'Light', uiLanguage: 'Language',
    listenerAddress: 'Address for listeners', listenerAddressHint: 'Enter this address in the phone’s browser (the phone must be on the same Wi-Fi):', noAddress: 'No network connection found.',
    heading: 'Heading', headingHint: 'Shown at the top of the listener page', save: 'Save',
    passwordSet: 'A password is set.', passwordNotSet: 'No password is set – the administration is open to everyone on the network.',
    newPassword: 'New password (at least 4 characters)', removePassword: 'Remove password', savePassword: 'Save password', logout: 'Sign out',
    newChannel: 'New channel', editChannel: 'Edit channel', channelName: 'Name (e.g. “Russian translation”)', spokenLanguage: 'Spoken language', cancel: 'Cancel',
    audioSource: 'Audio source', audioInput: 'Audio input {n}', startSending: 'Start sending', stopSending: 'Stop sending',
    mixer: 'Mixing desk input (no browser filters)', mixerHint: 'For a cable from the mixing desk: turns off the browser’s echo cancellation, noise suppression and automatic gain.',
    edit: 'Edit', reloadListeners: 'Reload listeners', delete: 'Delete', listeners: 'Listeners',
    sending: 'Live', sendingElsewhere: 'Live (other device)', connecting: 'Connecting …', off: 'Off',
    noAudioAccess: 'No access to audio inputs. Please allow it in the browser.', deviceGone: 'The audio source was disconnected.', micDenied: 'Microphone access was denied.',
    saved: 'Saved.', passwordSaved: 'Password saved.', passwordRemoved: 'Password removed.', loginAgain: 'Please sign in again.',
    confirmReload: 'Reload the page for all listeners of this channel? Listeners then have to tap “Play” again.',
    confirmDelete: 'Really delete channel “{name}”?', confirmRemovePassword: 'Remove the password? Anyone on the network can then use the administration.',
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], weekdaysShort: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    languages: { de: 'German', en: 'English', ru: 'Russian', uk: 'Ukrainian', fa: 'Persian (Farsi)', ar: 'Arabic', he: 'Hebrew', tr: 'Turkish', ro: 'Romanian', pl: 'Polish', es: 'Spanish', fr: 'French', hy: 'Armenian', ka: 'Georgian' },
    errors: {
      not_logged_in: 'Not signed in.', wrong_password: 'Wrong password.', too_many_attempts: 'Too many failed attempts. Please wait a minute.',
      channel_not_found: 'Channel not found.', invalid_name: 'The name must be 1 to 60 characters long.', invalid_language: 'Unknown language.',
      invalid_title: 'The heading may be at most 60 characters long.', password_too_short: 'The password must be at least 4 characters long.',
      already_live: 'This channel is already being broadcast.', not_publisher: 'This device is not sending on this channel.', unknown_transport: 'Unknown connection. Please try again.',
      audio_only: 'Only audio is supported.', cannot_consume: 'The browser cannot play the stream.', timeout: 'The server does not respond.',
    },
  },
  uk: {
    appTitle: 'Керування', addChannel: 'Додати канал', settings: 'Налаштування', close: 'Закрити',
    channels: 'Канали', stats: 'Статистика', login: 'Увійти', adminPassword: 'Пароль адміністратора',
    insecure: 'Передавання можливе лише безпосередньо на комп’ютері-сервері (адреса http://localhost) або через HTTPS. Керувати каналами й переглядати статистику можна звідусіль.',
    noPassword: 'Пароль адміністратора не встановлено. Будь-хто в мережі може користуватися цією сторінкою. Встановити пароль можна через шестерню праворуч угорі (Налаштування).',
    channel: 'Канал', period: 'Період', last30: 'Останні 30 днів', last90: 'Останні 90 днів', lastYear: 'Останній рік', allChannels: 'Усі канали разом',
    perDay: 'Середня кількість слухачів за день', statsEmpty: 'Даних ще немає. Статистика записується щохвилини, поки йде трансляція на будь-якому каналі.',
    average: 'Середнє', maximum: 'Максимум', perWeekday: 'Середнє за днями тижня', allDays: 'Усі дні',
    date: 'Дата', day: 'День', avgListeners: 'Ø слухачів', airtime: 'Час ефіру',
    appearance: 'Оформлення', dark: 'Темне', light: 'Світле', uiLanguage: 'Мова',
    listenerAddress: 'Адреса для слухачів', listenerAddressHint: 'Введіть цю адресу в браузері телефона (телефон має бути в тій самій мережі Wi-Fi):', noAddress: 'Мережеве підключення не знайдено.',
    heading: 'Заголовок', headingHint: 'Показується вгорі сторінки слухачів', save: 'Зберегти',
    passwordSet: 'Пароль встановлено.', passwordNotSet: 'Пароль не встановлено – керування відкрите для всіх у мережі.',
    newPassword: 'Новий пароль (щонайменше 4 символи)', removePassword: 'Видалити пароль', savePassword: 'Зберегти пароль', logout: 'Вийти',
    newChannel: 'Новий канал', editChannel: 'Змінити канал', channelName: 'Назва (наприклад, «Російський переклад»)', spokenLanguage: 'Мова мовлення', cancel: 'Скасувати',
    audioSource: 'Джерело звуку', audioInput: 'Аудіовхід {n}', startSending: 'Почати передавання', stopSending: 'Зупинити передавання',
    mixer: 'Вхід з мікшерного пульта (без фільтрів браузера)', mixerHint: 'Для кабелю від мікшерного пульта: вимикає ехоподавлення, шумоподавлення та автоматичну гучність браузера.',
    edit: 'Змінити', reloadListeners: 'Перезавантажити у слухачів', delete: 'Видалити', listeners: 'Слухачі',
    sending: 'В ефірі', sendingElsewhere: 'В ефірі (інший пристрій)', connecting: 'Підключення …', off: 'Вимк.',
    noAudioAccess: 'Немає доступу до аудіовходів. Дозвольте доступ у браузері.', deviceGone: 'Джерело звуку від’єднано.', micDenied: 'Доступ до мікрофона заборонено.',
    saved: 'Збережено.', passwordSaved: 'Пароль збережено.', passwordRemoved: 'Пароль видалено.', loginAgain: 'Будь ласка, увійдіть знову.',
    confirmReload: 'Перезавантажити сторінку в усіх слухачів цього каналу? Після цього слухачам потрібно знову натиснути «Відтворити».',
    confirmDelete: 'Справді видалити канал «{name}»?', confirmRemovePassword: 'Видалити пароль? Після цього будь-хто в мережі зможе користуватися керуванням.',
    weekdays: ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота'], weekdaysShort: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    languages: { de: 'Німецька', en: 'Англійська', ru: 'Російська', uk: 'Українська', fa: 'Перська (фарсі)', ar: 'Арабська', he: 'Іврит', tr: 'Турецька', ro: 'Румунська', pl: 'Польська', es: 'Іспанська', fr: 'Французька', hy: 'Вірменська', ka: 'Грузинська' },
    errors: {
      not_logged_in: 'Ви не увійшли.', wrong_password: 'Неправильний пароль.', too_many_attempts: 'Забагато невдалих спроб. Зачекайте хвилину.',
      channel_not_found: 'Канал не знайдено.', invalid_name: 'Назва має містити від 1 до 60 символів.', invalid_language: 'Невідома мова.',
      invalid_title: 'Заголовок може містити не більше 60 символів.', password_too_short: 'Пароль має містити щонайменше 4 символи.',
      already_live: 'На цьому каналі вже йде передавання.', not_publisher: 'Цей пристрій не веде передавання на цьому каналі.', unknown_transport: 'Невідоме з’єднання. Спробуйте ще раз.',
      audio_only: 'Підтримується лише звук.', cannot_consume: 'Браузер не може відтворити потік.', timeout: 'Сервер не відповідає.',
    },
  },
};

let adminLanguage = 'de';

/** Sets the admin interface language (falls back to German). */
function setAdminLanguage(code) {
  adminLanguage = ADMIN_TEXTS[code] ? code : 'de';
  document.documentElement.lang = adminLanguage;
}

/** Returns an admin text; {name} placeholders are replaced from vars. */
function at(key, vars = {}) {
  const value = ADMIN_TEXTS[adminLanguage][key] ?? ADMIN_TEXTS.de[key] ?? key;
  return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : value;
}

/** Returns the admin text for a server error code, or the message itself when it is no known code. */
function errorText(err) {
  const code = err?.message || String(err);
  return ADMIN_TEXTS[adminLanguage].errors[code] || code;
}

/** Fills elements below root: data-i18n sets the text, data-i18n-label the aria-label and title. */
function translatePage(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = at(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-label]').forEach((el) => {
    el.setAttribute('aria-label', at(el.dataset.i18nLabel));
    el.title = at(el.dataset.i18nLabel);
  });
}
