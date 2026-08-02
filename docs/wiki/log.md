---
type: log
status: current
updated: 2026-08-02
sources: []
tags:
  - project-docs
  - wiki/log
---

# ai-tools Wiki Log

## [2026-08-03] fix | Холст: провод можно схватить, а отказ — услышать

- Владелец: «привязка промт узлов чета не работает». Диагноз по
  `systematic-debugging`, два независимых дефекта, оба воспроизведены вживую
  ДО правки — и ни один не про сам узел «Промпт»: они были на доске с первого дня
  и просто впервые попались на глаза.
- **Порт был 8 пикселей, и промах не «ничего не делает».** Нажатие мимо точки
  попадает в ПОЛОТНО, и доска уезжает из-под курсора — со стороны это выглядит
  ровно как «привязка не работает». Теперь `Handle` — прозрачная область 24px, а
  видимая точка 12px это её `pointer-events-none` ребёнок: мишень выросла, вид
  не изменился. Плюс `connectionRadius={80}` вместо дефолтных 20 — прощает
  промах на стороне СБРОСА (целиться можно в край карточки).
- **Законный отказ происходил молча.** `canConnect` считал причину и возвращал
  её английской фразой, а оба потребителя эту фразу выбрасывали; когда
  `isValidConnection` говорит «нет», React Flow вообще не зовёт `onConnect` —
  линия просто отщёлкивает назад. Правило, работающее ровно как задумано (второй
  «Промпт» в узел, где уже есть один), было неотличимо от сломанной фичи.
  Теперь причина это КОД (`self · unknown · noOutput · noInput · duplicate ·
  capacity · cycle`), `edgeRefusalMessageKey` переводит его в ключ, а
  `onConnectEnd` — единственный хук, который срабатывает на отказанном сбросе —
  поднимает один дедуплицированный тост с локализованной копией. Отпускание над
  пустым полотном это ОТМЕНА и молчит.
- Живая проверка (доска `c9c7e45a`): «Промпт» → «Видео» соединяется обычным
  перетаскиванием, повтор того же провода отказан с тостом «Эти два уже
  соединены». Тесты: Canvas 115/115 (добавлены коды отказа и тотальность
  маппера), `eslint src` чист, typecheck чист вне чужой незавершённой правки
  `film.ts`.
- Отдельно про метод: три моих «провальных» проверки подряд были ошибкой
  ИЗМЕРЕНИЯ, а не кода — я подставлял CSS-координаты в инструмент, который ждёт
  координаты скриншота (масштаб 1.115). Пересчёт — и всё сошлось. Записано,
  чтобы в следующий раз сверять систему координат прежде, чем чинить.

## [2026-08-02] feat | Холст: узел «Промпт» — один текст на несколько узлов

- Запрос владельца: «на странице нет возможности создавать промты которые будут
  использоваться как шаблоны». Предложил три формы (узел на доске / библиотека
  промптов на всё приложение / холст целиком как шаблон) — выбран **узел**.
  ADR: `docs/wiki/decisions/canvas-prompt-node.md` (снимает строку «Out of scope:
  node templates» из `canvas-mode`).
- **Это вид узла, а не новая сущность.** `canvasNodeKindSchema` получает
  `'prompt'`, текст живёт в уже существующем `config.prompt` (потолок 2000), а
  сервис холста хранит `kind` как непрозрачный текст и никогда его не толкует —
  **одна строка в контракте это весь серверный код фичи**. Цена решения названа
  честно: шаблон переиспользуется ТОЛЬКО внутри одной доски; межхолстовое
  переиспользование — это архитектура `/styles` (строка + CRUD + пикер) и ждёт
  отдельного запроса.
- **Провод несёт ТЕКСТ и СЛИВАЕТСЯ, а не заменяет:** `[шаблон, своё].join('\n')`.
  Слияние — потому что заменяющий шаблон сделал бы всех детей одинаковыми, а
  смысл в «общая голова + вариация». Шаблон ПЕРВЫЙ — он верхний по проводу, и
  собранный текст должен читаться так же, как выглядит доска. Перевод строки, а
  не `', '` — выдумывать пунктуацию это как получить `neon city,, a fox` из
  шаблона, кончающегося запятой. Пустая половина не даёт разделителя вовсе.
- **Одна функция композиции на трёх потребителей** (`composeNodePrompt`): путь
  денег (`buildRunInput`), план ветки (`blockerFor`) и подсказка на карточке.
  Это весь риск фичи в одной строке: разойдись они — и узел с пустым своим полем
  показывает выключенный «Сгенерировать» над совершенно рабочей задачей. Длина
  промпта теперь меряется по СОБРАННОМУ тексту, поэтому узел с одним шаблоном
  запускается; токен персонажа `[[e1]]` по-прежнему ведёт итоговую строку.
- **Третий слот в правилах связи** (медиа · персонаж · промпт), ёмкость 1 на
  `image`/`video`: два шаблона в один узел означали бы порядок слов, зависящий от
  истории кликов. Заодно убрано дублирование «какой слот у источника» — оно жило
  в двух местах и читало `kind === 'character' ? … : 'media'`, а третий слот это
  ровно тот момент, когда такая пара расходится.
- Узел — МЕБЕЛЬ, как карточка персонажа: `NodeShell` в вечном `idle`, только
  выходной порт, ни модели, ни цены, ни «Сгенерировать»; `RUNNABLE_KINDS` не
  тронут, поэтому в плане ветки он не может стать платной строкой. Поле несёт
  обязательную искру (закон владельца) — именно здесь она окупается лучше всего:
  один улучшенный шаблон поднимает всех детей разом. Подпись «питает N узлов», а
  при нуле связей — что делать дальше («соедините с узлом изображения или видео»),
  потому что «питает 0 узлов» это число, прикидывающееся информацией.
- Карточка-потребитель проговаривает общую половину над своим полем
  (`line-clamp-2`): иначе пользователь читает «a fox», а платит за
  «cinematic 35mm, neon⏎a fox».
- Гейт: contracts **166/166**, web **934/934** (Canvas 112), api canvas 10/10,
  typecheck contracts+web чист, `eslint src` чист. Живая проверка на доске
  `c9c7e45a`: узел добавляется из палитры, текст сохраняется (PATCH 200), провод
  тянется, карточка изображения показывает «Общий промпт: cinematic 35mm, neon
  rain», подпись «питает 1 узел».

## [2026-08-02] feat | Галерея: видеокарточка-постер и полноэкранный просмотрщик

- Запрос владельца: «карточку видео сделай более красивой по вёрстке; при нажатии
  на видео — модалка на весь экран; все действия спрятать в три точки (удалить,
  редактировать); в модалке блок с информацией — промпт и модель». Затронуты
  `/create` и `/library` (одна и та же сетка), ADR не нужен — новых границ и
  контрактов нет, только UI-слой Gallery + одна новая величина в ките.
- **Карточка видео перестала быть плеером.** Было `<video controls>` прямо в
  плитке, и это стоило трёх вещей сразу: серый бар управления от браузера —
  единственный кусок хрома в сетке, который не принадлежит дизайн-системе;
  видео с `controls` съедает клик, поэтому клип был ЕДИНСТВЕННОЙ карточкой,
  которую нельзя открыть (9:16 смотрели в леттербоксе внутри 300px квадрата); а
  сам `controls` — точка табуляции, так что Tab уходил во внутренности плеера
  раньше, чем к действиям карточки. Теперь плитка = постер: `preload="metadata"`
  плюс **медиа-фрагмент `#t=0.1`** (без него Chrome рисует ЧЁРНЫЙ элемент —
  проверено в живом приложении), `muted playsInline pointer-events-none
  aria-hidden`, поверх — диск play на `void/60` и чип длительности в левом
  нижнем углу, и вся плитка — одна кнопка с промптом как доступным именем.
  `object-cover` вместо леттербокса: сетка остаётся сеткой квадратов, честный
  полный кадр — в одном клике (ровно та сделка, которую плитка изображения уже
  заключила).
- **Просмотрщик стал полноэкранным и двухпанельным.** Новый размер кита
  `Modal size='full'` = `h-[92dvh] max-w-[96rem]`, и он единственный задаёт
  ВЫСОТУ: лист — flex-колонка, а двум панелям нужна определённая высота, чтобы
  её поделить, иначе сцена схлопывается по контенту и скроллер колонки не
  включается никогда. Сетка `minmax(0,1fr) 22rem` на ≥lg: слева сцена
  (`well`-плита, `object-contain`), справа колонка информации со своим
  скроллером; ниже lg — стопка, скроллится всё тело (сплит на 380px — это две
  непригодные колонки).
- **Блок информации** читается сверху вниз: подпись + зелёный чип «Готово», ⋯,
  ПРОМПТ на отдельной `well`-плите (единственное длинное поле; `break-words`,
  потому что в промпт вставляют 300-символьные ссылки), затем `<dl>` из шести
  фактов — модель, тип, формат, длительность, стоимость, дата (`tabular-nums`).
  **Имя модели**, а не id: каталог отдаёт МАРШРУТ (`useCatalog` в
  `_shell.create.tsx` и — новое — в `_shell.library.tsx`, тот же кэш
  `['catalog']`, лишнего запроса нет), потому что Gallery не имеет права
  импортировать запрос Generator'а. Нет каталога или модель сняли с полки →
  печатается сырой id: это по-прежнему честный ответ на «чем это сделано».
- **Все действия — в ⋯, рейка иконок удалена.** Удаление необратимо, а сидело
  оно прямо под медиа с тем же визуальным весом, что и «Скачать» (design.md
  §13.2 — деструктивное и второстепенное живёт в overflow). Набор действий тот
  же общий `useGenerationActions`, обёрнутый на один уровень, чтобы просмотрщик
  добавил своё «…и закрыть лист» для `regenerate`, не рассказывая набору о том,
  что просмотрщик существует.
- **«Перегенерировать» → «Редактировать».** Действие грузит промпт и модель
  обратно в композер и ОСТАНАВЛИВАЕТСЯ — ничего не перегенерируется, пока
  пользователь не нажмёт «Сгенерировать». Старое название выдавало бесплатное
  действие за платное. Id остался `regenerate` (по нему просмотрщик решает,
  закрываться ли), ключ `gallery.actions.regenerate` остался в обоих локалях
  (правило «ключи не удаляем»), иконка refresh-петли УДАЛЕНА — после
  переименования на неё никто не ссылался.
- **Правка в тот же день (владелец: «вёрстка кривая, кнопка крестик»).** Замерил в
  живом приложении на 1336×839: ⋯ заканчивалась на x=1255, а ✕ листа с него же и
  начинался — зазор НОЛЬ, плюс расхождение по вертикали 4px (54 против 58). Две
  одинаковые сорокапиксельные окружности, слипшиеся и невыровненные. Кнопка ⋯
  переехала из колонки в ХРОМ листа: `absolute top-6 right-[4.5rem]` на самой
  панели, тот же `top-6`, что у крестика Modal'а. 24 + 40 = 64px — там кончается
  ✕, поэтому 4.5rem это первый отступ, дающий минимальные 8px по §13.1. Теперь обе
  на y=58 с зазором 8px, и хром не уезжает вместе с текстом при скролле колонки.
  Заголовок колонки получил `lg:pr-28` (только на ≥lg — в стопке кластер висит над
  медиа), гутеры колонки `lg:pt-6 lg:pr-3 lg:pl-1`, «Создано» занимает обе ячейки
  `<dl>` (дата ломалась посередине в колонке 160px). Проверено геометрией, а не
  на глаз: `scrollWidth === clientWidth` у каждого бокса, диалог 1304×772 внутри
  1336×839, сетка 915 + 12 + 352 = 1279.
- Гейт: web **914/914** тестов зелёные (Gallery 44), `tsc --noEmit` чист,
  `eslint src` без замечаний, живая проверка в браузере — сетка, модалка, меню.
  Известный ДОЛГ не из этой работы: `pnpm -r lint` красный на
  `apps/api/src/config.ts` (`segmindApiKey` объявлен и не используется).

## [2026-07-30] feat | Каталог шаблонов: полка «Брик-мульты» — восемь историй

- Новая полка в каталоге Cinema Studio (запрос владельца: «лего-мультфильмы с
  историями», «много готовых шаблонов»): восемь покадровых кирпичных мультфильмов
  — `brick-heist` (ограбление банка), `brick-space` (космическая миссия),
  `brick-race` (большая гонка), `brick-castle` (побег из замка), `brick-build`
  (стройка века), `brick-noir` (кирпичный детектив), `brick-pirates` (пираты
  кирпичного моря), `brick-city` (день минифигурки). ADR: тот же
  `docs/wiki/decisions/template-catalog.md` — новых архитектурных решений полка не
  вводит, только расширяет enum категорий (`templateCategorySchema`) и добавляет
  восемь файлов в `catalog/`.
- **Название игрушечного бренда не встречается НИГДЕ** — ни в промптах, ни в
  пользовательских текстах, ни в id. Это проверяется тестом по всему каталогу
  (`templates.test.ts`, «names no trademark the providers moderate on», с
  границами слов, чтобы английское «allegory» не ловилось). Причины независимые:
  это чужой зарегистрированный знак, и модерация Veo такие промпты отклоняет — то
  есть сломался бы ТОЛЬКО премиум-тариф, молча, пока черновик и стандарт рисуют
  нормально. Проверено вживую: бренд вписан в одну строку — тест падает и называет
  файл; строка убрана — 156 проверок зелёные. Словарь вместо бренда: «plastic
  construction bricks», «minifigure», «brickfilm», «visible brick studs», в
  русских текстах — «брик-мульт», «минифигурка», «конструктор».
- **Три инструкции в промптах держат весь вид**, и каждая — это спор с дефолтом
  модели, а не украшение (полностью расписаны в шапке `brick-heist.ts`, остальные
  семь ссылаются на неё): *рваная покадровая анимация без motion blur* — модель,
  обученная на живой съёмке, интерполирует гладко, и кирпичные персонажи начинают
  двигаться как CGI-рендер, что убивает иллюзию целиком (тот же бой, что описан у
  стиля `hand-drawn` в `presets.ts`); *жёсткое печатное лицо, которое не играет* —
  без запрета модель анимирует резиновую мультяшную мимику и игрушка перестаёт
  быть игрушкой, эмоция должна идти телом и камерой; *tilt-shift макро со
  штырьками, следами формы и пылью* — именно это говорит «это сняли на столе», а
  не «это отрендерили».
- `styleId: 'cinematic'` на всех битах, а не `'3d-cartoon'`: брикфильм — это
  СНЯТЫЙ физический пластик, поэтому фотореалистичный стиль правильный, а его
  негативный промпт («cartoon, anime, illustration») как раз отталкивает вторую
  ошибку из списка выше. Та же логика, по которой `fruit-drama` берёт `cinematic`
  для гиперреалистичного макро.
- Практические эффекты названы там, где у медиума есть свой: **вата** вместо дыма
  (просить «smoke» — получить симуляцию жидкости и потерять настольную иллюзию с
  первого кадра), **море из наклоняемых пластин** вместо воды (анимировать воду
  нельзя), **модель, рассыпающаяся на детали** для любой аварии — единственный
  родной спецэффект медиума, и `brick-race` использует его дважды: как катастрофу
  и как спасение (пересборка на пит-лейне).
- Формат полки жёсткий и проверяется тестами: 5–6 платных клипов по 8 с плюс 1–2
  бесплатные титульные карточки (нижняя граница драматургическая — пять битов это
  минимум на завязку/перелом/развязку; верхняя экономическая — седьмой клип
  выводит премиум за ~1000 кредитов, где формат перестаёт быть импульсной
  покупкой), русская реплика на каждом платном бите, 2–3 ручки, из них максимум
  одна свободным текстом и только в реплику или титр.
- Цены (считаются из живого каталога, не авторские): 280 / 675 / 700 кредитов при
  пяти клипах, 336 / 810 / 840 при шести. Соотношение сторон — по истории, а не по
  полке: 9:16 там, где кадр собран из крупных планов и высоких пространств, 16:9
  для космоса, гонки и пиратов. Все три тарифные модели умеют 8 с и в 9:16, и в
  16:9, поэтому выбор ничего не стоит, а `assertTemplatesValid()` проверяет это на
  старте.
- Полка встала ВТОРОЙ в галерее, после «Форматов»: она самая большая (восемь из
  одиннадцати шаблонов) и единственная, где это законченные ИСТОРИИ — формат берут,
  чтобы переписать, брейнрот — чтобы выложить, брик-мульт — чтобы посмотреть.
  «Буран» съехал на третье место и сохранил свою роль «шаблон, с которым работают».
- Гейт: contracts 129 · api 775 · web 835 тестов зелёные, typecheck api/web чистый,
  ESLint без замечаний. Из них 156 проверок — сам каталог шаблонов.

## [2026-07-30] feat | openCreator: фронтенд агентского чата `/creator`

- Новый раздел `/creator` — агент, которому задачу описывают одним сообщением:
  он сам пишет сценарий, создаёт персонажа, собирает холст и — после ОДНОГО
  подтверждения бюджета — запускает генерации. Бэкенд (детачед tool-use цикл)
  уже был; здесь весь фронт: `modules/Creator` + маршрут + пункт навигации.
  ADR: `docs/wiki/decisions/opencreator-agent.md`.
- Состояние экрана — это САМА переписка. Каждый шаг агента лежит в базе как
  сообщение со структурным контентом (`text` / `step` / `plan` / `result`),
  поэтому экран перерисовывает всю историю из одного GET, локального прогресса
  нет вообще, и перезагрузка ничего не теряет (D4 из ADR). Порядок — серверный
  (`created_at`, `rowid`), на клиенте не пересортировывается никогда.
- Опрос — 2 с, пока сессия `running` ИЛИ `awaiting_confirm`. Второй случай
  неочевиден и сделан намеренно: из бюджетных ворот можно выйти БЕЗ участия этой
  вкладки (подтвердили во второй вкладке, новое сообщение сбросило флаг
  `confirmed` на сервере, 10-минутный реапер уронил заход). Остановленный опрос
  оставил бы живую кнопку «Подтвердить» над планом, который сервер уже отменил.
- Карточка плана — единственное место, где тратятся деньги, и она НЕ решает это
  сама. `planStateFor(messages, index, status)` смотрит на всю переписку:
  `live` (ворота открыты и это самое свежее сообщение) → кнопка работает;
  `answered` (после плана что-то произошло) → выключена, а что именно произошло,
  рассказывают сообщения ниже; `stale` (ворот нет, но после плана ничего не
  было — заход умер на плане) → выключена + объяснение с выходом. Карточка,
  рассуждающая по своему содержимому, могла бы подтвердить бюджет, который агент
  уже заменил вторым планом. Отличить «подтверждено» от «устарело» фронт не
  может (в сообщении плана нет поля исхода) — поэтому в `answered` он не
  утверждает ни того, ни другого вместо того, чтобы угадывать.
- Мутации ВПИСЫВАЮТ ответ, а не инвалидируют: каждый POST отвечает `202` с
  перепиской на текущий момент, `absorbSessionDetail` кладёт её в
  `['creator-session', id]` и апсертит строку рейла (новые сессии — в начало,
  известные — на месте, чтобы список не перетряхивался под читающим). `409` —
  ожидаемая гонка состояний (опрос не догнал сервер к моменту клика), поэтому
  тихий info-тост + рефетч, а не экран ошибки над здоровым диалогом.
- Санитизированную СЕРВЕРНУЮ ошибку переводим, а не показываем: упавший заход
  оставляет в переписке одну из трёх фиксированных английских фраз;
  `model/agentCopy.ts` отображает это замкнутое множество в локализованный текст
  (только точное совпадение — модель, цитирующая фразу внутри ответа, пишет
  прозу, а не сообщает об аварии) и рендерит спокойным амбером с `role=status`.
  Амбер, не красный: пользователь ничего не сделал не так, просто провайдер
  агента выключен (правило frontend-error-ux про непереведённые строки бэкенда).
- Композер несёт искру улучшения промпта (закон владельца) на wrapper-div внутри
  собственного `relative`-бокса поля, `pr-10` на textarea. Черновик очищается
  ТОЛЬКО когда отправка удалась — иначе слова пользователя съедала бы любая
  ошибка сети. Закрытый композер всегда называет следующее действие:
  «агент работает…» и «подтвердите бюджет выше» — разные ситуации, а серый
  пустой бокс не сообщает ни об одной. При `failed` вход остаётся ОТКРЫТЫМ:
  спросить снова — это и есть повтор.
- Экран сам открывает самый свежий диалог, поэтому перезагрузка возвращает туда,
  где пользователь был, без параметра в URL; `Selection` — union из трёх случаев
  (`auto | session | new`), иначе «Новая задача» тут же выбрасывало бы обратно
  в свежайшую сессию. Ограничение выбора: он не шарится ссылкой — апгрейд
  через `?session=`.
- Живая проверка на dev-стеке: `ANTHROPIC_API_KEY` в `.env` нет, но есть
  `DEEPINFRA_TOKEN`, поэтому цепочка мозгов упала на DeepSeek и агент реально
  работает. Сессия «привет, что ты умеешь?» → `running` → `idle` с ответом
  по-русски; второе сообщение вызвало `list_models` и дало карточку шага
  (free step, без цены); двойной POST во время захода вернул `409`; баланс
  остался 200 кредитов — ничего не списано. Платный план намеренно не
  подтверждался.
- Тесты: web 769 → 835 (66 новых), contracts 125, api creator 48. lint,
  typecheck и `pnpm build` чистые; `_shell.creator` уходит в отдельный чанк.

## [2026-07-30] feat | Canvas Mode: узловой холст генераций (фазы 1–2)

- Новый раздел `/canvas` — доска, на которой генерации связываются проводами:
  prompt → image → video. Холст, как и фильм, ЦИТИРУЕТ генерации:
  `canvas`/`canvas_node`/`canvas_edge` + PATCH всего документа целиком
  (last-write-wins, один владелец), а запуск узла — обычный `POST /api/generations`.
  Денежный код не тронут вообще. ADR: `docs/wiki/decisions/canvas-mode.md`.
- Ключевое открытие при реализации цепочки: у image-моделей НЕТ `inputImage` —
  они кондиционируются через серверный канал `referenceImages` под воротами
  `referenceMode`/`maxReferenceImages`. Поэтому `inputGenerationId` резолвится
  по-разному: для image сервер подмешивает своё сохранённое медиа в
  `referenceImages` (и цитата ЗАСЧИТЫВАЕТСЯ в лимит референсов), для video —
  кладёт кадр-затравку в `inputImage` провайдера. Байты не ездят по сети:
  клиент шлёт только id, сервер читает свой же файл.
- Фронт: `modules/Canvas` на `@xyflow/react` (новая зависимость, ~45 КБ gz).
  Узлы — обычный DOM: `NodeShell` (стальная карточка, статусная рамка + СЛОВО),
  `ImageNode`/`VideoNode` (мини-композер: 4 состояния, промпт, `Select` модели с
  ценой, формат, длительность), `UploadNode`, `NoteNode`, `VersionStrip`
  (регенерация ДОПИСЫВАЕТ версию, не затирает). Истина документа — singleton
  Zustand + `init()`/`reset()` на смену маршрута (дисциплина `wizardStore`);
  объекты React Flow ВЫВОДЯТСЯ на рендере, а не хранятся.
- Первый в кодовой базе дебаунс-автосейв (`useCanvasDoc`, 1.5 с тишины, флаш на
  unmount, амбер «not saved · retry» вместо тостов) — редактор узлов правит
  документ на каждом драге, кнопка «Сохранить» тут абсурдна. Подписка на стор,
  а не селектор: цикл не должен ререндерить доску на каждый штрих.
- Закон связей (`edgeRules`, чистая функция, 11 тестов) проверяется ДВАЖДЫ —
  при перетаскивании (провод не примагничивается) и при записи. Два слота на
  узел (медиа + персонаж), video — терминальный, циклы запрещены.
- Отклонения от плана, найденные по дороге: у узла НЕ БЫЛО выбора формата, а API
  требует `aspectRatio` для image/video — добавлен `Select` формата и сверка
  формата/длительности при смене модели (иначе каждый запуск падал бы в 400);
  цена берётся из `creditsByDuration` под выбранную длительность, а не из
  базовой (иначе карточка обещала бы цену дешёвого клипа); вся копия уведена в
  i18n (en+ru) по закону проекта; в шапку добавлен пункт «Canvas» — без него
  маршрут существовал бы, но был бы недостижим.
- Тесты: contracts 112, API 598, web 708 (+30 канвасных). tsc + eslint чисты,
  SSR-сборка и prerender проходят. Живая проверка: документ, загрузка файла и
  реальная генерация (flux-schnell, 1 кредит) прошли сквозь стек; отказные пути
  цепочки (модель без `referenceMode`, `inputImage` вместе с `inputGenerationId`)
  вернули 400, не списав ничего.

## [2026-07-24] feat | Cinema composer: inline "@" tags photos in the prompt

- Owner report: "@" in the cinema chat did nothing (the picker lived only in /create's
  ChatComposer). The shot prompt now speaks the same protocol: the caret math moved
  `modules/Generator/model/mentionQuery.ts` → `shared/libs/mentionQuery.ts`, the popup
  `MentionAutocomplete` → `shared/ui` (strings + anchor are props; cross-module law —
  Cinema may not import Generator). ChatComposer only re-points imports; behaviour there
  is unchanged.
- The cinema picker lists TWO photo-backed row kinds: cast-able characters (with their
  primary reference photo — `CastableEntity` gained optional `imageUrl`, derived in
  `routes/cinema.$filmId.tsx` like `_shell.create.tsx`) and the shot's ATTACHED photos
  ("Фото N"). A character splices `[[eN]]` at the caret; a photo opens
  `MakeCharacterModal` (the server composes a NAME into the prompt — a raw picture has
  none), then tags the fresh entity at the recorded "@" span, DELETEs the raw ref and
  toasts — the PersonIcon bridge entered from the keyboard. Picker closed at MAX_CAST=5.
- New i18n `cinema.mention.*` (en+ru). Wire/money paths untouched (entityRefs still
  derived from the text; references still server-sourced). Tests: web 647→650
  (tag-at-caret PATCH body, photo→name→tag + ref DELETE, Escape); tsc + eslint clean.

## [2026-07-22] feat | CinemaStudio atomic shot split (backend)

- `POST /api/films/:id/shots/:shotId/split` body `{ atMs }` — the NLE's split-at-playhead. `atMs` is
  measured from the shot's OWN start; the service enforces `0 < atMs < durationMs` (400 otherwise).
- One db transaction: shot A keeps its `trimStartMs` and is truncated to `atMs`; a NEW shot B is
  inserted DIRECTLY AFTER A (midpoint `order_index`), citing the SAME `generationId`, with
  `trimStartMs = A.trimStartMs + atMs` and `durationMs = original - atMs`. B copies footage fields
  (generation, prompt, promptPreset, modelId, native `audio`) but NOT beat fields (title, voiceover,
  entityRefs, referenceImages) and enters with `transition: 'none'` (contiguous halves). Returns the
  updated FilmDetail so the client replaces its cache in one write.
- New `apps/api/src/modules/films/shot-split.ts` sibling (kept out of the oversized `films/service.ts`,
  like shot-references); narrows the film service to `Pick<FilmService,'getFilm'>`. Contract:
  `splitShotInputSchema` in `packages/contracts/src/film.ts`.
- Money path UNTOUCHED: a split cites an existing generation, creates none, charges nothing (asserted).
  No schema/migration change (reuses the shot table). Tests: contracts 89→93, API +3 (`films.test.ts`).

## [2026-07-21] feat | CinemaStudio shot reference images (backend)

- Attach ARBITRARY images directly to a shot (not only tagged Entities), persisted on the shot so
  they survive a re-generate. New `apps/api/src/modules/films/shot-references.ts` sibling (kept out
  of the already-oversized `films/service.ts`).
- Contract (`packages/contracts/src/film.ts`): `Shot.referenceImages: {id,path}[]`,
  `addShotReferenceInputSchema` (data:image/*, no svg, 14MB), `generateShotClipInputSchema`
  (generation input + entityRefs≤5, strips `referenceImages`), `MAX_SHOT_REFERENCE_IMAGES=5`.
- DB: `shot.reference_images_json` (+ ddl + guarded micro-migration in `client.ts`).
- Routes: `POST/DELETE …/shots/:shotId/references`, `POST …/shots/:shotId/clip` (the delivery seam).
- Guarantee preserved: the wire `createGenerationInputSchema` still has NO `referenceImages` field —
  the clip route sources the shot's stored images into the closed channel server-side. Money path
  UNCHANGED (rides `generations.create()`). Tests: contracts 70→81, API +8 (`films-shot-references.test.ts`).

## [2026-05-28] bootstrap | Wiki initialized

- Created initial LLM Wiki structure in `docs/wiki`.

## [2026-05-28] update | Project documentation wiki skill configured

- Updated `project-documentation-wiki` in Codex skills and mirrored it to Claude/Agents skill folders.
- Added workspace rule in `AGENTS.md` requiring wiki checks at project task start and documentation updates after project-changing prompts.
- Created initial project wiki pages for this workspace.

## [2026-05-28] ingest | Notion modular architecture docs

- Read the Notion "Модульная архитектура" page, its linked Routing, Prettier, and ESLint pages, and the linked FigJam "Modular" board.
- Added [[notion-modular-architecture]] as the external source summary.
- Added [[modular-frontend-architecture]] as the durable architecture synthesis for future frontend/project structure work.

## [2026-05-28] update | Frontend architecture guardrails

- Updated [[modular-frontend-architecture]] with `shared` admission rules, dependency/public API boundaries, TanStack Router, TanStack Query, Zustand, single ESLint flat config, and measured `manualChunks` rules.
- Added [[frontend-architecture-guardrails]] as the decision record for these project-level frontend architecture rules.

## [2026-05-28] update | UI component sourcing rule

- Updated [[modular-frontend-architecture]] and [[frontend-architecture-guardrails]] to require project-owned or skill-provided UI components first.
- Documented shadcn/ui as the fallback component source when no suitable project/skill component exists.

## [2026-05-28] ingest | React patterns

- Preserved imported React pattern files under `docs/wiki/raw/react-patterns/`.
- Added [[react-patterns-source]] as the source summary for the imported React patterns and LobeHub layout/component conventions.
- Added [[react-patterns]] as the implementation-level React pattern guide and linked it from [[modular-frontend-architecture]] and [[frontend-architecture-guardrails]].

## [2026-05-28] ingest | Next.js skill files

- Preserved imported Next.js skill files and skill reports under `docs/wiki/raw/next-js/`.
- Added [[next-js-skill-sources]] as the source summary for Next.js App Router, Next.js 16 Launchpad, and Better Auth integration guidance.
- Added [[next-js-patterns]] as the framework-specific Next.js guidance page and linked it from [[modular-frontend-architecture]] and [[frontend-architecture-guardrails]].

## [2026-05-28] update | Frontend agent plugin

- Created the Codex-first `frontend` plugin with `.codex-plugin/plugin.json`, compatibility `.claude-plugin/plugin.json`, and `skills/frontend-agent/`.
- Bundled architecture, guardrail, React, Next.js, UI governance, audit, and source provenance references into the `frontend-agent` skill.
- Updated the existing `react-19-frontend-agent` to use the current TanStack Router, TanStack Query, Zustand, shadcn fallback, `shared`, and Next.js mode rules.
- Added local feature docs for `frontend/` and `react-19-frontend-agent/`.
- Added [[frontend-agent-plugin]] workflow documentation.

## [2026-05-28] update | Test-first development rule

- Added a workspace rule in `AGENTS.md` requiring test-first development for every new code-changing task.
- Documented [[test-first-development-required]] with the required order, frontend JS/TS testing rule, backend Python testing rule, E2E expectations, and explicit test case checklist requirement.
- Linked the rule from [[schema]] and [[index]] so future project startup reads surface it.

## [2026-05-28] update | Agent assets consolidated

- Created `agent-assets/` as the canonical folder for local skill/plugin packages, agent configs, and rule/reference files.
- Moved `frontend/`, `react-19-frontend-agent/`, and `frontend-design-plugin/` under `agent-assets/`.
- Kept root `AGENTS.md` in place for Codex project-rule discovery and updated its local frontend-design mirror paths.
- Added `tools/verify-agent-assets.ps1` to validate the consolidated structure and counts for skills, agents, and reference/rule files.
- Added [[agent-assets-consolidation]] and updated [[frontend-agent-plugin]], [[overview]], [[index]], and local feature docs to the new paths.

## [2026-05-28] update | Frontend project bootstrap

- Added `agent-assets/project-documentation-wiki/` so documentation wiki startup is bundled with the project-local agent assets.
- Added `tools/install-agent-assets.ps1` to install local skills, agents, `AGENTS.md`, `docs/wiki/`, and `docs/frontend/` into target frontend projects.
- Added `tools/test-install-agent-assets.ps1` to verify the installer against a temporary target project.
- Updated `AGENTS.md`, `frontend-agent`, and `react-19-frontend-agent` so frontend work starts through the project-local documentation wiki, frontend router skill, React sub-skills, and frontend-design governance.
- Added [[frontend-project-bootstrap]] and updated [[agent-assets-consolidation]], [[frontend-agent-plugin]], [[overview]], and [[index]].

## [2026-05-28] update | Frontend error UX startup audit

- Added the bundled `frontend-error-ux` skill under `agent-assets/frontend/skills/`.
- Updated frontend project initialization to immediately audit for a 404 page, blocking error modal/dialog, crash fallback, and offline no-internet screen blocker.
- Updated installer verification, frontend audit docs, feature docs, and [[frontend-error-ux-startup-required]].

## [2026-05-29] update | Codex global skill install verified

- Installed or refreshed project-created skills into `C:\Users\User\.codex\skills`: `project-documentation-wiki`, `frontend-agent`, `frontend-error-ux`, `frontend-design`, `react-19-frontend-agent`, `react-19-patterns`, `typescript-react-routing`, and `nextjs-app-router-practices`.
- Verified all eight installed `SKILL.md` files with `quick_validate.py` using UTF-8 mode.
- Confirmed `agent-assets/` still validates with 8 skills, 7 agent metadata files, and 22 reference/rule files.

## [2026-05-29] update | Template Project starter

- Created `Template Project/` as a ready-to-copy frontend project starter with local `agent-assets/`, `AGENTS.md`, `AgentMD.md`, `docs/wiki/`, and `docs/frontend/`.
- Added `tools/test-template-project.ps1` to verify template structure, skill paths, agent metadata counts, and startup-rule coverage.
- Added `Template Project/FEATURE.md` and [[template-project]] to document the template as a durable project artifact.
- Updated [[frontend-project-bootstrap]] and [[index]] to include the template workflow.

## [2026-05-29] update | Repository publication

- Created the private GitHub repository `AzamatRaimbekov/frontend-agents`.
- Added `origin` pointing to `https://github.com/AzamatRaimbekov/frontend-agents.git`.
- Published `master` with the initial project commit.
- Could not create the GitLab repository because no GitLab CLI, token, credential helper entry, `.config` entry, or `.netrc` credential is available locally.
- Added [[repository-publication]] to track remote publication status.

## [2026-06-02] update | Prompt refiner required

- Created the `prompt-refiner` skill under `agent-assets/prompt-refiner` and installed it globally to `C:\Users\User\.codex\skills\prompt-refiner`.
- Updated root `AGENTS.md`, the project-local installer, and `Template Project` startup chain so prompt refinement is the first agent step.
- Added verification coverage for bundle structure, installer output, template output, and global skill install.
- Added [[prompt-refinement-required]] to document the behavior and the limit that skills run after Codex receives a message, not before the model sees it.

## [2026-06-03] update | Superpowers local plugin mirror

- Added the Codex Superpowers plugin mirror under `agent-assets/superpowers/` with its `.codex-plugin` manifest, assets, all 14 skills, and OpenAI agent metadata.
- Updated root `AGENTS.md`, `tools/install-agent-assets.ps1`, and `Template Project` so target projects use local Superpowers workflows for planning, TDD, debugging, review, verification, and delivery.
- Updated verification scripts to require Superpowers in `agent-assets`, installer output, and `Template Project`, raising expected counts to 23 skills and 22 agent metadata files.
- Added [[superpowers-local-plugin]] and updated [[agent-assets-consolidation]], [[frontend-project-bootstrap]], [[template-project]], [[test-first-development-required]], [[overview]], and local feature docs.

## [2026-06-03] update | Design system steward skill

- Added `agent-assets/frontend/skills/design-system-steward/` with OpenAI agent metadata and a `design-md-template.md` reference.
- Added `docs/frontend/design.md` as the detailed design-system source of truth for palette intent, token usage, platform notes, accessibility, and governance.
- Updated the frontend plugin, installer managed AGENTS block, Template Project, verification scripts, frontend docs, feature docs, and [[design-system-steward]] workflow page.

## [2026-06-03] ingest | Claude plugin directory registry

- Imported the public Claude Plugins directory from `https://claude.com/plugins` into `agent-assets/claude-plugin-directory.config.json` as a single-file catalog registry with 100 entries.
- Copied the registry into `Template Project/agent-assets/claude-plugin-directory.config.json` so copied projects receive the same catalog metadata.
- Updated installer/template instructions to treat the registry as disabled-by-default catalog metadata with secrets stored outside the repository.
- Added verification coverage for the registry in `tools/verify-agent-assets.ps1`, `tools/test-install-agent-assets.ps1`, and `tools/test-template-project.ps1`.
- Added [[claude-plugin-directory]] and updated [[agent-assets-consolidation]], [[template-project]], [[overview]], and local feature docs.

## [2026-06-03] ingest | Imported UI/UX, review, and backend skills

- Imported `ui-ux-pro-max`, `code-reviewer`, and `backend-patterns` from the user-provided GitHub skill folders into `agent-assets/`.
- Adapted `ui-ux-pro-max` to store the real `data/` and `scripts/` resources locally and use `agent-assets/ui-ux-pro-max/scripts/search.py` paths.
- Added OpenAI metadata for imported skills that lacked it, updated root/project-local startup rules, and routed frontend UI work through `ui-ux-pro-max` alongside `frontend-design`.
- Updated installer, Template Project, verification scripts, wiki workflow pages, and local feature docs.
- Installed the three imported skills globally under `C:\Users\User\.codex\skills` and validated them there.
- Added [[imported-agent-skills]] as the source summary for these imports.

## [2026-06-03] update | Claude plugin directory folder mirror

- Generated `agent-assets/claude-plugin-directory/plugins/` with 100 physical package folders, one per public Claude Plugins directory entry.
- Added matching package folders under `Template Project/agent-assets/claude-plugin-directory/plugins/`.
- Added per-package `manifest.json`, `README.md`, `.claude-plugin/plugin.json`, and applicable plugin/MCP/skill capability files.
- Updated registry entries with `local_package_path` values and `schema_version: 2`.
- Updated verification scripts to require package folders for every registry entry and to verify installer/template propagation.
- Added local feature docs for the Claude plugin directory mirror and updated [[claude-plugin-directory]], [[agent-assets-consolidation]], [[frontend-project-bootstrap]], [[template-project]], and [[index]].

## [2026-06-03] ingest | Code Review Graph test plugin

- Imported `tirth8205/code-review-graph` at commit `0c9a5ff3371cf78f89032ff6936e3d3a5fedf0b8` into `agent-assets/code-review-graph/` and `Template Project/agent-assets/code-review-graph/`.
- Kept upstream source, tests, docs, hooks, `.mcp.json`, `uv.lock`, and all seven review-graph skills in the local bundle.
- Added local `manifest.json`, `.codex-plugin/plugin.json`, and `.claude-plugin/plugin.json` wrappers so verification and template copying can treat it as a project-local test plugin.
- Updated root/template agent rules, installer managed `AGENTS.md`, verification scripts, local feature docs, and wiki pages.
- Added [[code-review-graph-plugin]] as the source summary.

## [2026-06-03] ingest | SkillsMP backend skill pack

- Used SkillsMP backend/category search and selected high-signal backend sources for architecture, database engineering, API design, observability, FastAPI, Node/Express, and backend code review.
- Created `agent-assets/backend/` as a local backend plugin with eight skills: `backend-engineering`, `backend-api-contracts`, `backend-data-persistence`, `backend-security-auth`, `backend-reliability-observability`, `backend-performance-scaling`, `backend-framework-patterns`, and `backend-code-review`.
- Added shared provenance and quality references under `agent-assets/backend/references/`.
- Updated root/template agent rules, installer managed `AGENTS.md`, verification scripts, local feature docs, and wiki pages.
- Installed all eight backend skills globally under `C:/Users/User/.codex/skills/` and validated them with `quick_validate.py`.
- Verified the bundle with `tools/verify-agent-assets.ps1`, `tools/test-install-agent-assets.ps1`, and `tools/test-template-project.ps1`.
- Added [[skillsmp-backend-skills]] and [[backend-skill-pack]].

## [2026-06-03] update | Go FastAPI Django backend skills

- Added `backend-golang`, `backend-fastapi`, and `backend-django` to `agent-assets/backend/` with OpenAI agent metadata.
- Updated SkillsMP source provenance with Go/Golang, FastAPI, and Django/DRF marketplace sources.
- Updated root/template agent rules, installer managed `AGENTS.md`, verification scripts, local feature docs, and wiki pages.
- Installed all three new backend framework skills globally under `C:/Users/User/.codex/skills/` and validated them with `quick_validate.py`.

## 2026-07-06 — openCreate MVP kickoff

- Ran project-kickoff gate: prompt-refiner → brainstorming (user decisions: base generation scope, auth+credits no payments, Vite SPA + separate backend, i18n EN+RU) → feature-architecture → research workflow wf_9fc64756-311 (Higgsfield product map, Runware API, pricing).
- Recorded accepted ADR [[opencreate-mvp-architecture]] and spec `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md`. User approved architecture explicitly.
- Next: writing-plans → implementation (monorepo scaffold, contracts, API, SPA, landing).

## 2026-07-06 — openCreate MVP implemented (plan Tasks 1–22)

- Executed `docs/superpowers/plans/2026-07-06-opencreate-mvp.md` test-first across parallel agent chains: workspace scaffold → `packages/contracts` (shared Zod schemas) → `apps/api` (Fastify 5: better-auth + signup bonus, transactional credit ledger, curated catalog, Runware REST client, local media storage, generation lifecycle with charge/poll/refund) → `apps/web` (React 19 SPA: Paper & Ink design system, auth, generator, gallery with 4s polling, credits chip, app shell, EN/RU landing with verified price claims, pricing page) → Playwright e2e with fully mocked `/api` + `/media`.
- Verification: root `pnpm lint`, `pnpm typecheck`, `pnpm test` (116 tests: 6 contracts / 31 api / 79 web), `pnpm build` — all green; e2e 2/2 (happy path with balance 200→165, RU landing). Manual smoke: API boots on :8787, `/health` + `/api/catalog` + 401 envelope verified.
- Docs: `apps/api/FEATURE.md`, `apps/web/FEATURE.md`, [[opencreate-implementation]] (ADR → code map incl. recorded deltas: charge-at-submit collapses hold→settle; landing prerender deferred to stretch Task 23), sidecar `.md` docs for every source file.
- Chore: `.gitignore` now excludes agent-runtime state (`.claude-flow/`, `.swarm/`, `.rtk/`, `ruvector.db`, `memory.db`); previously tracked runtime files untracked.

## 2026-07-07 — openCreate web v2 "Light Editorial" redesign

- Replaced the rejected v1 "Paper & Ink" look with the v2 "Light Editorial" direction (premium print-magazine identity): cream/ink/vermillion/sand tokens in `theme.css` `@theme`, self-hosted Fraunces Variable (display serif, italic accent word) + Space Grotesk Variable via @fontsource, hairline rules, stamp badges, pill controls, no heavy shadows (`3305c12`).
- New `ShowcasePoster` shared component + `showcasePosterArt.ts`: six poster-grade SVG compositions (dusk/sea/botanical/mono/ultraviolet/koi) with feTurbulence grain replacing every placeholder gradient; honest EN/RU "sample style" figure captions, one `video · 5s` marker (`9d0106d`).
- Restyled all surfaces without touching behavior/routes/roles/i18n keys: landing hero + "The index" price table + 01/02/03 how-it-works + FAQ + colophon and /pricing (`2f56573`); app shell masthead, /login editorial split with sand manifesto, generator "commission sheet", gallery magazine figures (`cb228e3`); QA round 1 refinements incl. emoji→currentColor-SVG glyph rule (`59cf4f9`). Error surfaces (404/crash/offline/modal) share the editorial voice. The four approved claims keep exact meaning in both locales.
- Docs: `docs/frontend/design.md` rewritten as v2 (`9d0b1e5`), `apps/web/FEATURE.md` refreshed, sidecar `.md` docs kept current per file.
- Verification: root `pnpm lint` / `pnpm typecheck` / `pnpm test` (142 tests: 8 contracts / 39 api / 95 web) / `pnpm build` (landing prerender injected into `dist/index.html`) all green; Playwright e2e 2/2 (mocked API); fresh 1440px full-page landing screenshot reviewed against the brief's visual QA checklist.

## 2026-07-07 — openCreate api production ops hardening

- `apps/api` production hardening in three TDD commits: `5e8de3d` feat(api): native env loading + structured logging; `cdd94a3` feat(api): sanitized errors + rate limits; plus production single-origin serving (this entry's commit).
- **Env**: `loadEnvFromFile()` in `src/config.ts` wraps Node 22 `process.loadEnvFile` (ENV_FILE → nearest `.env` walking up from cwd; real env always wins; missing file = no-op) — `pnpm dev` / `db:migrate` need no manual sourcing.
- **Logging**: fastify pino logger (LOG_LEVEL, default info, silent in tests), authorization/cookie/set-cookie redaction, reqId on request-scoped lines; structured money-path events (`credits.signup_bonus|charge|refund`, `generation.settle|fail`, `provider.error`) logged after-commit and guard-gated so log line ⇔ ledger/state change.
- **Errors**: unexpected 5xx sanitized to `{ internal_error, 'Something went wrong' }` — real message + stack to logs only; domain ApiErrors keep messages.
- **Rate limits**: `@fastify/rate-limit` global 300/min per IP; strict buckets `/api/auth/*` 10/min and `POST /api/generations` 20/min; 429 = shared envelope with new contracts code `rate_limited` (additive enum change, web uses the type only).
- **Single-origin prod**: NODE_ENV=production + existing `WEB_DIST_PATH` (default `../web/dist`, package-root anchored) serves the SPA at `/` with index.html fallback for non-/api non-/media GETs; api-only deploys boot clean without a web build.
- **Sessions**: better-auth `trustedOrigins` from TRUSTED_ORIGINS (comma list, default WEB_ORIGIN); `advanced.disableOriginCheck: false` set explicitly because better-auth silently skips the CSRF origin wall under NODE_ENV=test; `.env.example` documents BETTER_AUTH_URL = public https origin in prod.
- **Runnable dist**: `pnpm --filter @opencreate/api build` = tsc type gate + esbuild bundle → single `dist/index.js` (contracts inlined — its `.ts` exports are unloadable by plain node; deps external); root + api `start` scripts run `NODE_ENV=production node --enable-source-maps`.
- Verification: api lint/typecheck green, 68 api tests green (39 pre-existing + 29 new across env-loading/logging/errors-sanitized/rate-limit/static-web/trusted-origins); manual smoke of the bundled dist: `/health` + SPA at `/` on :8891 with env from repo-root `.env`.

## 2026-07-07 — openCreate production packaging (Docker + runbook)

- Root `Dockerfile` (multi-stage, `e5c6fb2`): `node:22-slim` base + corepack pnpm (pinned via `packageManager`); **build** stage = full workspace install + `pnpm build` (contracts inlined into the api esbuild bundle; web dist with landing prerender); **prod-deps** stage = `pnpm install --prod --frozen-lockfile --filter @opencreate/api...` (lockfile-exact prod node_modules, better-sqlite3 linux prebuild via the `allowBuilds` allowlist); **runtime** stage = api dist + web dist + pruned node_modules under the non-root `node` user, `HEALTHCHECK` via node `fetch` (no curl in slim).
- **Decision — prerender needs no browser**: `apps/web/scripts/prerender.mjs` is a pure-Node SSR pass (`renderToString` over the vite SSR bundle), so NO playwright/chromium image stage and NO `SKIP_PRERENDER` flag were introduced; playwright stays a dev-only e2e dependency.
- `docker-compose.yml`: one service on 8787, `env_file: .env` (compose forces `NODE_ENV=production` over it), `./data:/app/data` volume (SQLite + media), `restart: unless-stopped`, `/health` healthcheck. Gotcha fixed during verification: compose interpolates `${…}` inside the healthcheck string — the node probe uses string concatenation instead of a template literal.
- `.dockerignore` keeps `.env*`, `.git`, agent-runtime state, `node_modules`, `dist`, and `data` out of the build context (secrets never reach the image).
- Docs: new `PROD.md` runbook (env table incl. `BETTER_AUTH_URL` = public https origin + `TRUSTED_ORIGINS`, first-run steps — migrations run automatically on boot via `createDb()`, Caddy/nginx TLS blocks, backup = copy `./data`, SQLite single-instance rule with the Postgres pointer to [[opencreate-mvp-architecture]]); README production section; `apps/api/FEATURE.md` ops section.
- Verification: `docker build` green; `docker run --rm` with dummy `RUNWARE_API_KEY` → `/health` `{"ok":true}`, prerendered landing served at `/`, `/api/catalog` 200, 401 envelope on `/api/me`, container `health=healthy`, db+WAL+media created in `/app/data` as uid 1000; `docker compose config` clean; api lint/typecheck/85 tests green (no api source changes needed — boot-time DDL bootstrap already existed).

## 2026-07-07 — openCreate web v4 "Bioluminescent Terminal" redesign

- Replaced the v2 "Light Editorial" look with the owner-chosen Midjourney-style reference direction (design law `docs/frontend/style-reference-v3.md`, §Adaptations binding — flat `#06051d` void everywhere, **NO gradients**): cosmic-void surface ladder (void → abyss → steel → ridge, elevation by color steps, the only shadow is `shadow-pill`), whisper-weight JetBrains Mono everywhere (headings 30px weight 400, weights >500 forbidden) with DM Sans as sparing secondary prose, closed specimen pill triad (green = create/submit, amber = explore/browse, red = auth-exit/destructive; same triad signs generation statuses), portal-blue as the only chromatic prose accent (`252ab38` tokens + shared UI restyle).
- Landing rebuilt as a full-viewport hero: dependency-free animated ASCII-sphere canvas (`AsciiSphere`, `prefers-reduced-motion` → static frame) behind the mono wordmark, claims, and two specimen-pill CTAs; then the ~800px research column — 8 duotone SVG "specimen" plates (one video-marked, honest EN/RU sample labeling kept), "The index" price table, mono how-it-works prose, FAQ, minimal footer; /pricing got the same index treatment (`3ce8dbf`).
- App screens restyled with all behavior/routes/i18n keys/claims/tests-by-role intact: steel app shell with amber balance chip, /login single steel card (red sign-in / green sign-up pills per reference taxonomy), commission-sheet generator with amber model-selection rings and a glow-green cost numeral, gallery figure cards on abyss media wells with the amber/green/red status triad, credits ledger modal (`e5888a4`).
- QA rounds: `e96d1d0` (round 1); `70fb5cc` (round 2) added `TableScrollRegion` — a keyboard-focusable overflow wrapper with a dynamic mono "scroll →" hint (`common.scrollHint`, EN/RU) around both wide tables, the no-gradient scroll affordance.
- frontend-error-ux re-audit under v4 passed: custom 404 (`NotFoundPage` as root `notFoundComponent`), blocking error-modal pattern (`Modal` with `role="alertdialog"` + `ErrorState`), root crash fallback (`AppErrorBoundary` outside the providers), offline screen-blocking overlay (`OfflineOverlay`, z-60 above modals, self-clearing) — all four surfaces wired in `routes/__root.tsx` with tests.
- Docs: `docs/frontend/design.md` rewritten as the terminal design-system source of truth; `apps/web/FEATURE.md` refreshed; per-file sidecar `.md` docs kept current (`85f3d52`, `a3b354f`, `93e59bd`, `2ecfe4a`, `fd738a2`).
- Verification: root `pnpm lint` / `pnpm typecheck` / `pnpm test` (193 tests: 8 contracts / 85 api / 100 web) / `pnpm build` (landing prerender injected into `dist/index.html`) all green; Playwright e2e 2/2 (mocked API); diff grepped for `gradient` (clean); fresh 1440px full-page landing + 1440×900 login screenshots reviewed.

## 2026-07-07 — openCreate api security review fixes (SSRF redirect, trustProxy)

- Two verified high-severity review findings fixed test-first in `apps/api`: `fc3a0f5` fix(api): ssrf redirect bypass; `eb17afd` fix(api): trust proxy for per-client rate limits.
- **SSRF redirect hop closed** (`src/storage/local.ts`): `assertAllowedAssetUrl` gated only the FIRST url while `fetch()`'s default `redirect: 'follow'` let any 30x on an allowlisted host (open redirect / hostile provider payload) re-point the server-side fetch at internal targets (169.254.169.254 metadata, localhost admin ports) and publish the bytes under public `/media/*`. Now `saveFromUrl` fetches with `redirect: 'manual'` and treats ANY 30x as `asset redirect not allowed: <status>` — provider asset URLs are direct links, redirects are hostile by definition. Hardening in the same pass: scheme is https-only (`asset url not allowed: https required` — plain http to an allowlisted host previously passed). Residual, documented not implemented: DNS-rebinding (resolver-level private-IP check) if the threat model grows.
- **Rate-limit attribution behind the reverse proxy** (`src/app.ts` + `src/config.ts`): Fastify was built without `trustProxy` while PROD.md documents Caddy/nginx forwarding everyone from loopback — `req.ip` (the `@fastify/rate-limit` bucket key) was ALWAYS the proxy's address, so all users shared single buckets: 10 cheap auth requests/min from one attacker locked ALL users out of sign-in (availability DoS + per-client attribution impossible). New `TRUST_PROXY` env (default-deny tri-state → `config.trustProxy: boolean | string` → Fastify `trustProxy`): unset/`false` = header-deaf (direct exposure), `true` = trust X-Forwarded-For (proxy must OVERWRITE the inbound header — nginx `$remote_addr`, not `$proxy_add_x_forwarded_for`; Caddy is safe by default), or an address/CIDR/keyword list (`loopback,uniquelocal` — safest, appended client junk never trusted).
- Docs: PROD.md (TRUST_PROXY env row + X-Forwarded-For hygiene section + fixed nginx sample), `.env.example`, `apps/api/FEATURE.md`, sidecar `.md` docs for local.ts/config.ts/app.ts/build-test-app.ts.
- Verification: TDD red→green per fix; api lint/typecheck green; 93 api tests green (85 pre-existing + 8 new: 2 storage SSRF, 4 TRUST_PROXY parsing, 2 rate-limit-behind-proxy behavior).

## 2026-07-07 — openCreate api money-path race + refund backstop + download limits

- Four confirmed review findings fixed test-first in `apps/api`: `ecb7c7f` fix(api): guard refund against succeeded race + atomic video submit failure; `de61e59` feat(api): db-level refund-once index + asset download limits; `5e8913c` docs(api): commit refs recorded in the six touched sidecars.
- **Refund-after-success race closed** (`src/modules/generations/service.ts`): `failGeneration` ran `refundCredits` UNCONDITIONALLY inside its transaction — only the failed-flip was status-guarded, so a row a concurrent settler had already flipped to `succeeded` stayed succeeded but was refunded anyway (user keeps asset + money). The check-and-set now guards the WHOLE settlement: only the processing → failed flip triggers the refund; any other status = no-op.
- **Atomic video submit-failure settlement**: `create()`'s video catch block ran refund and the failed flip as TWO transactions (refund first, flip unguarded) — a crash between them committed a refund while the row stayed processing. The block now reuses the guarded atomic `failGeneration` (one transaction, both or neither).
- **DB-level refund-once backstop** (`src/db/ddl.ts` + `client.ts`): new `REFUND_ONCE_INDEX_DDL` — UNIQUE index on `credit_transaction(generation_id, kind)` makes duplicate refund/charge rows physically impossible (NULL generation_ids, i.e. signup bonuses, stay unconstrained). Exec'd SEPARATELY from the main DDL inside try/catch + `console.warn`: legacy dupes must not brick the boot — the app-level transactional guard still holds and stays silently idempotent on top.
- **Asset download limits** (`src/storage/local.ts` + `config.ts` + `index.ts`): `saveFromUrl` gets one AbortController deadline spanning headers AND body streaming (`ASSET_FETCH_TIMEOUT_MS`, default 120s — undici resolves fetch() at headers, so a fetch-only timeout would not stop an endless body) and a byte cap counted by a Transform while streaming (`ASSET_MAX_BYTES`, default 512MB — Content-Length is never trusted); on violation the download aborts and the partial file is unlinked (a truncated asset is never served from `/media/*`).
- Docs: `apps/api/FEATURE.md` (credits invariants, media limits, env table, test count), sidecar `.md` docs for service.ts/ddl.ts/client.ts/local.ts/config.ts/index.ts/build-test-app.ts.
- Verification: TDD red→green per fix (2 + 1 + 3 + 3 + 2 new tests across generations-money-atomicity/ledger/storage/env-loading); api lint/typecheck green; 104 api tests green (93 pre-existing + 11 new).
- Post-fix gate (full pass, fresh run): `pnpm --filter @opencreate/api lint` clean, `typecheck` clean (run via `rtk proxy` = raw `tsc --noEmit` — the rtk tsc filter had emitted stray `.js` build artifacts next to sources during one earlier typecheck; the remaining gitignored strays incl. root `vitest.config.js`/`drizzle.config.js` were deleted, the `.gitignore` guard from the incident stays), 104/104 tests green, `build` green (tsc gate + esbuild `dist/index.js`). Production dist boot smoke: `NODE_ENV=production node dist/index.js` with a throwaway temp data dir (fresh SQLite + media) on a free port — `GET /health` 200 `{"ok":true}`, `GET /api/catalog` 200 full 7-model payload, structured pino request logs with reqIds, clean kill. `apps/api/FEATURE.md` + sidecars verified already current from `de61e59`/`5e8913c` (no doc drift found).

## 2026-07-07 — openCreate web final gate (lint/typecheck/test/build/e2e) + e2e polling-budget fix

- Full `@opencreate/web` gate run end-to-end: `lint` (eslint src) clean, `typecheck` (`tsc --noEmit`, run via `rtk proxy` to keep the rtk tsc filter from re-emitting `.js` strays — none found before or after) clean, vitest 135/135 across 26 files, production `build` green with the prerender guard injecting `/` into `dist/index.html`, Playwright e2e 2/2.
- One e2e red fixed test-first (`eee53b6` test(web): stamp fresh createdAt in e2e mocks to stay inside the polling budget): `e2e/mocks.ts` carried a FIXED `createdAt: 2026-07-06T10:00Z` from before the hardening round — `useLiveGeneration`'s 20-minute `GENERATION_STALL_MS` budget (QA finding 1) measured from that stale stamp, so the SPA (correctly) stopped polling after the first tick and rendered the amber "taking longer" card instead of flipping to the succeeded `<video>`. The mock now stamps `createdAt` fresh at POST time (and `completedAt` on success), keeping the mocked generation inside the budget for any future run. Product code untouched — the stall behavior itself is the desired hardening.
- frontend-error-ux audit re-verified before the gate: custom 404 (`NotFoundPage` as root `notFoundComponent`), blocking modal pattern (`Modal`, `role="alertdialog"` + focus trap), root crash fallback (`AppErrorBoundary` outside the providers), offline screen-blocking overlay (`OfflineOverlay`) — all wired in `routes/__root.tsx` with tests.
- Docs: `apps/web/FEATURE.md` gained a "Hardening (QA rounds + final gate)" section consolidating the round's outcomes (Modal focus trap + latent onClose-deps fix, confirm-before-delete alertdialog, `SubmitErrorBanner` closed per-code copy map, bounded polling with stalled/error states, `TableScrollRegion` overflow affordances) and the final-gate result; `e2e/mocks.ts.md` sidecar updated with the why.
- Verification: post-fix e2e 2/2 green (5.4s happy path + RU landing); `git status` clean for `apps/web` after the commits.

## [2026-07-08] design | ADR + spike for self-hosted Wan 2.2 video provider (Proposed)

- Added [[wan-selfhost-video-provider]] ADR (status Proposed — pending user approval + spike): a `VideoProvider { submit; poll }` seam behind the unchanged async lifecycle, RunPod-serverless-first for self-hosted Wan 2.2 A14B (only open Wan; 2.6/2.7 closed), Runware kept as the fast tier, presigned-PUT delivery into our own bucket (no SSRF widening), additive expand→backfill DB change, worker-side NSFW classifier as a hard prerequisite. Includes C4 container, happy-path + failure-path sequence, and generation state-machine Mermaid diagrams, plus the 4090-serverless-vs-$0.13 cost table.
- Added [[wan-runpod-feasibility-spike]] spike (< $5): measures cold-start C (delayTime) and warm gen G (executionTime) + real $/clip + quality vs Seedance, with explicit GO/ESCALATE/NO-GO gates and the exact user-provided prerequisites (RunPod account+key+$10, S3/R2 bucket, Seedance reference clip, region). Design-only; no implementation until the user approves and the spike passes.

## [2026-07-09] build | wan-runpod self-hosted video provider (ComfyUI-HTTP spike variant)

- Implemented the [[wan-selfhost-video-provider]] `VideoProvider { submit; poll }` seam and routed a second, self-hosted video provider (`wan-runpod`, Wan 2.2 on our RunPod GPU) through the UNCHANGED async generation lifecycle. Spike-grade decision: for this integration the provider talks to the pod's **ComfyUI HTTP API** (`POST /prompt`, `GET /history/<id>`, `/view`) — not the ADR's later serverless `/run` handler.
- New API surface: `integrations/video-provider.ts` (neutral `VideoSubmitInput` / `VideoPollResult` union `processing | success{assetUrl,costUsd,nsfw} | error`), `integrations/runware/video-adapter.ts` (wraps the UNCHANGED `RunwareClient` 1:1), `integrations/runpod/comfy-client.ts` + `integrations/runpod/wan22-t2v-workflow.ts` (embedded Wan 2.2 t2v graph, injected by node `_meta.title`: PROMPT_POSITIVE/NEGATIVE, LATENT_DIMS width/height/length = dur×16+1, SAMPLER_HIGH/LOW noise_seed, OUTPUT_VIDEO filename_prefix).
- Routing: `AppDeps.videoProviders` registry keyed by `runware`/`wan-runpod`; the generation service resolves the provider from the catalog model's `provider` at submit and from the row's persisted `provider` at poll. Image path stays Runware-only and unchanged. Every money-path invariant (charge-at-submit, refund-once, stale reaper, 4s poll, poll-throttle, submit-window race guard) preserved byte-for-byte — only the provider CALL is swapped behind the seam.
- Contracts: additive optional `provider: 'runware' | 'wan-runpod'` on `catalogVideoModelSchema` (absent = runware). DB: additive `generation.provider TEXT NOT NULL DEFAULT 'runware'` micro-migration; the neutral provider job id / cost REUSE the existing `runware_task_uuid` / `runware_cost_usd` columns (no rename, instant rollback).
- Catalog: `wan-2-2` ("Forge", provider `wan-runpod`, premium, 16:9/9:16/1:1, 5s → 60 credits, t2v only); `verify-catalog` skips non-runware models. Web: `wan-2-2` → Wan mark in `modelPresentation`, EN/RU descriptions added (auto-renders in the catalog-driven ModelSelect video group).
- Config: `COMFY_BASE_URL` (optional, unset-safe — model listed, submit returns a clean `provider_error`); its host is auto-folded into `ASSET_HOST_ALLOWLIST` so `saveFromUrl` can pull the finished mp4 from `/view`. `storage/local.ts` untouched (generic).
- **Known gap (carried from the ADR):** self-hosted ComfyUI has no provider-side NSFW check → wan-runpod always reports `nsfw:false`, so the §9.4 gate never fires for it until a worker-side classifier lands. Documented in FEATURE.md + the catalog entry + the service poll path.
- Verification (strict TDD, red→green per unit): `@opencreate/contracts` 11/11; `@opencreate/api` 136/136 (was 104: +7 runware-adapter, +11 comfy-client, +5 provider-routing, +3 config), lint + typecheck clean, production `build` (tsc gate + esbuild bundle) green; `@opencreate/web` ModelSelect 11/11 + typecheck clean. No live generation run (pod owner runs the real end-to-end once weights finish).

## [2026-07-11] build | Seedance 2.0 direct from ByteDance (ModelArk) as a third video provider

- **The cost case for this integration collapsed under verification, and it was built anyway — deliberately.** `docs/research/2026-07-07-seedance-direct-vs-runware.md` priced Seedance 2.0 direct at $0.46/5s 720p (vs Runware's $0.80) using ByteDance's **$4.30/M-token** rate. That rate applies only when the input contains a **video**. Our flows (t2v, image→video) carry **no video input** and bill at **$7.00/M** — so the real cost is **$0.756**, and the saving is **~5%, not 72%** (~$44/mo at 1 000 clips, not ~$336). Confirmed by ByteDance's own deduction ratio (4.30 × 1.6279 = 7.00) and the token formula validated against a live response (243 000 predicted vs 246 840 actual, 5s 1080p). A correction banner now heads the research doc; the "2 000–5 000 clips/mo" trigger in it is void. The user chose to build the direct channel with this on the table — for the model itself (2.0 was **absent** from the catalog) and for direct control of `generate_audio`/4k/15s, not for price. ADR: [[seedance-direct-bytedance]].
- **Product constraint, not a bug: Seedance 2.0 refuses real human faces on input** (`InputImageSensitiveContentDetected.PrivacyInformation`). The warning sits on the whole `content` array, so it covers i2v first-frames, not just reference mode. ByteDance trusts only its **own** recent outputs, preset digital characters, or identity-verified assets — a face from **our** Flux models is not on that list, which collides with the Entity Library's portrait premise ([[entity-library-reference-tagging]]). i2v ships **enabled** (it works for everything that is not a face) with the refusal mapped to a **refundable `content_blocked`** naming the real reason, and the model-picker description says so before a credit is spent. **Unverified inference:** that a photorealistic Flux portrait is actually refused — first live-key test must confirm.
- New API surface: `integrations/bytedance/ark-client.ts` — the third `VideoProvider` (`POST /api/v3/contents/generations/tasks` → `cgt-…` id; `GET …/tasks/{id}` → six-state status folded into the neutral union). Transport/content failure split mirrors the other two providers exactly, so every money-path invariant is untouched.
- Seam: `VideoPollResult`'s error variant gained `blocked?: boolean` — distinct from `nsfw` (a finished-but-unsafe **output**); `blocked` marks a provider that produced nothing because it refused the **input**. Both settle to `content_blocked` + refund. The submit path now persists `content_blocked` too when the thrown error carries that `apiCode`.
- `registerCatalogRoutes` now takes a `ReadonlySet<VideoProviderId>` of configured backends instead of a `comfyConfigured` boolean (a second optional provider would have made it two booleans, then three). `AppDeps.videoProviders` became `Partial<…>` and is **merged** over the derived registry, so a routing test stubs only the backends it asserts on.
- Catalog: `seedance-2-0` ("Auteur", provider `bytedance`, `air: bytedance:dreamina-seedance-2-0-260128`, premium, 16:9/1:1/9:16, 5s→130 / 10s→260 credits, i2v on). **Pinned `resolutionProfile: 'hd'`** — left to the tier ladder a `premium` model reads the fhd table and renders 1080p at **$1.87**/clip instead of $0.76 (~2.5× cost, silently). A catalog test asserts the price stays above wholesale; the 35-credit standard tier covers Seedance 2.0 at **no** provider.
- Config: `ARK_API_KEY` (optional, unset-safe — the model is **hidden** from `/api/catalog` and a submit returns a clean `provider_error`). `ARK_ASSET_HOST = tos-ap-southeast-1.volces.com` is auto-folded into `ASSET_HOST_ALLOWLIST` **only when the key is set**. Note: assets live on `*.volces.com`, **not** the API's `*.bytepluses.com` — allowlisting the API domain would pass the SSRF gate for zero real downloads and fail every actual one. ByteDance **hard-deletes** finished videos at 24h; the existing `saveFromUrl` copy-out already covers it.
- Pinned ModelArk facts (each breaks the integration silently): the `dreamina-` model-id prefix is **mandatory** on 2.0 and absent on 1.x; Seedance 2.0 **rejects** `seed`/`camera_fixed`/`frames`/`service_tier` (a caller seed is dropped on purpose); `generate_audio` **defaults true** → pinned false (it would collide with CinemaStudio's own audio tracks at render); `ratio` defaults to `adaptive` → always sent explicitly; `duration: -1` is legal and drives billing → never forwarded; Seedance is served from **ap-southeast-1 only**; `DELETE /tasks/{id}` **destroys** the record of a finished task → never called.
- Verification (TDD, test-first): `@opencreate/api` **264/264** (was 248: +21 ark-client, +4 provider-routing, +4 config/SSRF, +catalog gating & pricing floor), `@opencreate/web` **200/200**, lint + typecheck clean across the workspace. **No live generation run** — no ByteDance key exists yet; the open items (real-face refusal on a Flux portrait, PAYG rate, `generate_audio` product call) need one.

## [2026-07-11] build | Template Catalog — Brainrot Studio (3 templates)

- New module `Templates` (`/templates`): a gallery of pre-authored viral formats that instantiate
  into a whole film — prompts, presets, per-shot model, durations, titles and spoken lines already
  filled in. ADR: [[template-catalog]].
- Templates are **server-side code** (`apps/api/src/modules/templates/catalog/*.ts`, one file each);
  only a `TemplateSummary` (no prompt text) crosses the wire.
- Shipped: `fruit-drama` («Фруктовая измена»), `cat-drama` («Кошачья измена»), `talking-food`
  («Говорящие фрукты») — all researched against the real TikTok formats, 9:16, 8s beat grid.
- `POST /api/films/from-template` builds the film + all shots in one transaction and **charges
  nothing**; every shot lands as a draft. Credits are spent per-shot, by the user, later.
- Price/quality **tiers** pin `shot.modelId`: draft `pixverse-v6` (448cr) / standard `wan-2-7`
  (704cr) / premium `veo-3-1-fast` (1120cr, native spoken audio) for an 8-clip drama.
  `assertTemplatesValid()` runs at BOOT — a tier model that cannot do a clip's duration or the
  template's aspect ratio is a failed deploy, not a silently re-priced generation.
- Contracts: `shot.modelId` (also fixes the model choice never being persisted), `shot.voiceover`,
  `film.templateId`, `film_audio.shotId` (makes "voice this shot" a replace, not a duplicate charge).
  All nullable + additive; micro-migrations in `db/client.ts`.
- Cinema gained a per-shot voiceover action (TTS → a `film_audio` track at the shot's timeline
  offset) and pre-fills the music prompt from the film's template.
- Tests: 525 green (contracts 24, api 301, web 200), incl. `templates.test.ts` (data invariants:
  price ordering, placeholder/variable parity, free-text never in a visual prompt, voice ids valid)
  and `test/templates.test.ts` (behaviour: charges nothing, EN→prompt / RU→line, ownership).

## [2026-07-11] build | Nano Banana Pro as the reference/character model + the face-routing rule

- **Reference-image generation moved to Nano Banana Pro** (Gemini 3 Pro Image, AIR `google:4@2`) via the EXISTING Runware image path — no new provider, one catalog entry. Chosen over the cheaper Nano Banana 2 (`google:4@3`, ~$0.069/img) because a character reference is generated ONCE and reused for the life of the entity: identity fidelity across subjects is the product, and the per-image delta is noise against it. $0.138/img at 1K → **28 credits** (~2× margin, mirroring flux-kontext-pro). Flux models KEPT per the owner's call; Nano Banana becomes the reference model, not a replacement catalog.
- `resolutionProfile: 'nanobanana'` added (1024×1024 / 1376×768 / 768×1376 — its 1K tier). Load-bearing exactly as for Kontext: the model publishes its own dimension list and rejects anything outside it, so the default square1024 table's 1344×768 would earn a provider 400 on every 16:9 request.
- **Nano Banana does NOT unlock faces on Seedance 2.0, and saying so was the point.** ByteDance's trust list is closed: *"Only outputs generated by ModelArk are trusted, while outputs from other platforms are not supported."* Nano Banana is Google — its portraits are refused exactly as Flux's are. Changing the image model changes reference *quality*, not the *policy*.
- **The routing rule that follows, and it needed almost no new code** — the entity-library ADR already built the mechanism. `seedance-2-0` carries no `referenceMode`, therefore: `ModelSelect` filters it out of the picker the instant an entity is tagged, and `service.ts` re-validates server-side (*"a capability the client can lie about is not a capability"*). **Character shots route to Kling / Veo / PixVerse / MiniMax / Wan** (no real-face policy); **Seedance 2.0 keeps t2v and face-free i2v**. A portrait attached as a plain i2v first frame still reaches ByteDance and is refused there — that is what the `content_blocked` + refund path is for.
- Two tests pin the invariant so a future "helpful" edit cannot silently open a credit-burning path into ByteDance's moderation: `seedance-2-0` must never declare a `referenceMode`, and **no** reference-capable catalog model may be ByteDance-backed. Plus an end-to-end check that tagging a character at `seedance-2-0` is rejected by the API *before any money moves*, and that the same tag at `nano-banana-pro` composes the prompt, ships the reference image, and renders at 1376×768.
- Consequence: the 30-day trust window, the Seedream-5.0-Lite-only trust source, and the digital-character / authorized-asset paths are **all moot under this design** — we never feed a face into Seedance 2.0. They return only if the product later wants Seedance 2.0 to animate characters. Recorded in [[seedance-direct-bytedance]] with the routing diagram.
- Web: `nanobanana` provider mark (a monoline crescent — the literal read of the name is what users look for), EN/RU descriptions. Verification: `@opencreate/api` 308/308, `@opencreate/web` 200/200, `@opencreate/contracts` 24/24, lint + typecheck clean workspace-wide.

## [2026-07-11] research | Why the Seedream branch is a trap (post-decision hardening of [[seedance-direct-bytedance]])

Follow-up research on the rejected alternative — "generate references with Seedream so Seedance 2.0 accepts faces" — found it structurally worse than the ADR originally described. Recorded so nobody reopens it on a false premise:

- **No permanent identity exists for a synthetic character on ByteDance, at any price.** A permanent `asset://` id is issued ONLY to a real, consenting human who completes liveness verification via QR with their own BytePlus account, with a face-consistency check on every upload. An AI face has no live human to verify. A custom character under Seedance 2.0 is therefore *inherently* a **30-day-renewable object, never a permanent one** — a platform ceiling, not an implementation gap.
- **`seed` is not supported on Seedream 5.0 at all** (only legacy `seedream-3-0-t2i`, which itself disclaims reproducibility). There is no "re-mint the portrait from stored prompt+seed" refresh. The only renewal is a **trust chain** (portrait → Seedance 2.0 video with `return_last_frame` → that frame is trusted for a fresh 30 days), costing a video generation per refresh, drifting the face each hop, and **fatal if missed**: expired outputs are unusable and there is no seed to regenerate from → character unrecoverable. That chain is INFERRED from the trust table, never documented as supported.
- **Naming trap on the critical path:** `seedream-5-0-260128` **IS** the Lite model (`seedream-5-0` and `seedream-5-0-lite` are the same model), and **Lite text-to-image is the only trusted image source**. Choosing `dola-seedream-5-0-pro` "for quality" is NOT trusted → the video step breaks silently. Lite is also cheaper ($0.035 vs $0.045+), so compliance and cost agree — only the trap is real.
- Trust is **content-based, not URL-based** ("compressing or forwarding files may invalidate trust verification") → such a pipeline needs byte-exact preservation (no re-encode/resize/metadata-strip/CDN recompression). It is also **per-Ark-account** ("cross-account use is not supported") → no per-tenant account sharding.
- Seedream image API (for the record): `POST /api/v3/images/generations`, **synchronous** (no polling), both regions, `watermark` **defaults TRUE** (opposite of Seedance video), output URLs valid 24h.

**Net:** routing characters to Kling / Veo / PixVerse / MiniMax / Wan is not a workaround for the face policy — it is **the only branch in which a user's character is permanent**. The shipped design stands; no code change.

## [2026-07-12] fix | CinemaStudio end-to-end run: export was dead, audio could vanish, failures were invisible

Drove the whole CinemaStudio flow in a real browser against the live API (film → shot → clip → voiceover → music → export). Four defects, all reproduced, all fixed. Plus the answer on Seedance 2.0.

- **`Render mp4` never worked, for anyone.** `apiClient` set `Content-Type: application/json` on EVERY request, and `rendersApi` POSTs the render with **no body** → Fastify: *"Body cannot be empty when content-type is set to 'application/json'"* (400). The same call with `{}` returned 202 and rendered fine, which is what made the bug invisible in tests. The header now goes out only when a body actually does. A caller-supplied type still wins. — `apiClient.ts`
- **Audio could be dropped from an export while the render reported `succeeded`.** `addAudio`'s comment promised the cited generation must be *"succeeded"*; the code only checked `type`. A still-processing TTS row could be attached, the Audio panel showed it immediately, and a render started before the mp3 hit disk mixed nothing — `buildPlan` did `if (existsSync) push`, i.e. **silently skipped** it. Result: a silent mp4 the user had already paid 28 credits for. Both halves closed: attaching requires `succeeded`; a missing asset now **fails the render loudly** instead of downgrading it. A muted mp4 looks finished — that is precisely why it must never be the outcome. — `films/service.ts`, `test/films-audio-integrity.test.ts`
- **A failed `Generate` showed the user nothing.** No `onError` on the mutation, and `ShotClipStatus` only renders once `shot.generationId !== null` — so a submit that died *before* a generation row existed (502/402/400) produced no toast, no line, not even a console entry. Now a `role="alert"` line keyed off the machine error code. — `ShotInspector.tsx`
- **`ModelArk HTTP 404` was undiagnosable.** The adapter parsed ModelArk's error body only to test for moderation, then threw the bare status. The body already named the cause. Provider `code: message` now rides on `ArkError.providerDetail`, which the error handler **logs**. Deliberately NOT in `message`: `app.ts` serializes `message` to the browser for any `apiCode`-carrying error, and ModelArk's text contains **our BytePlus account id**. — `ark-client.ts`, `app.ts`
- **i18n leak:** the Framing / Camera motion / Quality pickers read `label` straight off `contracts/presets.ts`, whose 25 labels are hardcoded **Russian** — so they stayed Russian under EN. The contract keeps the enum + id order; the SPA now owns the wording under `cinema.preset.<axis>.<id>`. — `presetOptions.ts`

**Seedance 2.0 (`seedance-2-0`) is blocked by the ACCOUNT, not by our code.** A live probe against ModelArk returned `ModelNotOpen`: *"Your account 3003474417 has not activated the model dreamina-seedance-2-0-260128."* Host, path, model id and bearer auth are all correct (the wrong region answered 401, which is what proves the key is good). In the BytePlus console the model shows **Free inference quota: 0 / total 0 tokens** — alone among the media models, which all carry 500k free — so it requires a **purchased resource package** before `Activate` does anything. Console pricing confirms the catalog's assumption (`Exclude video input: 7 USD/M tokens` = the $0.0070/1k the 130-credit price is derived from); at the top of the published range ($0.0077/1k) margin falls 42% → ~36% but never negative. **No code change needed — the catalog is right.**

Not a bug, recorded so it is not "fixed" later: the shot Duration picker offers 2/3/5/8/10s regardless of model. That is deliberate (`presetOptions.ts`) — the strip length is an editorial choice and `composeShotClipInput` snaps the *generation* duration to the model's nearest supported option. Worth noting that a 3s shot on a 5s-minimum model is still billed at 5s, and CinemaStudio shows no per-shot cost anywhere; surfacing it is a product decision, not a defect.

Verification: `@opencreate/api` 337/337, `@opencreate/web` 221/221, typecheck clean both apps. Export re-driven from the real UI afterwards: `Download mp4` appears and the file carries a `soun`/`mp4a` track.

## [2026-07-12] feat | Wan 2.7 уходит с Runware напрямую в Alibaba Model Studio

Пока считали себестоимость, выяснилось, что **наценка Runware не плоская, а зависит от модели** — обобщение «Runware near cost» было неверным:

| Модель | Прайс вендора | Счёт Runware (замер) | Наценка |
|---|---|---|---|
| Seedance 1.5 Pro, 5s 720p | $0.2592 (ByteDance) | **$0.26136** | **+0.8%** |
| Wan 2.7, 5s 720p | **$0.50** (Alibaba, $0.10/s) | **$0.7557** | **+51%** |

Поэтому на прямой канал переведён Wan 2.7 — и **только он**. Остальные модели остаются на Runware, где агрегатор действительно продаёт почти по себестоимости и один ключ заменяет одиннадцать интеграций.

- **Новый провайдер `alibaba`** (`integrations/alibaba/dashscope-client.ts`) на нейтральном шве `VideoProvider`. Async submit → poll; их шесть статусов (`PENDING/RUNNING/SUCCEEDED/FAILED/CANCELED/UNKNOWN`) сворачиваются в наши три. Модерационный отказ настраивается как **возвратный `content_blocked`**, а не как 502.
- **Главная ловушка, ради которой писались тесты:** у Model Studio `resolution` **по умолчанию 1080P** — это $0.15/с против $0.10/с у 720P. Не передать разрешение явно значит молча переплачивать **50% на каждом клипе**. Ровно тот же класс бага, что этим же днём вырезан из Runware-пути (неотключённое аудио). Адаптер всегда шлёт `resolution` явно, выводя тир по КОРОТКОЙ стороне (720P портрет — это 720×1280).
- Прочее load-bearing: workspace id живёт **в хосте** (`{ws}.ap-southeast-1.maas.aliyuncs.com`), не в заголовке — ключ без него не образует URL, поэтому конфиг обнуляет пару целиком; `X-DashScope-Async: enable` обязателен на submit, иначе task id не вернётся; режим зашит в id модели (`wan2.7-t2v` / `wan2.7-i2v`) и выбирается по наличию стартового кадра, поэтому в каталоге одна строка на оба режима; `prompt_extend` (их дефолт — **true**) выключен, иначе модель перепишет промпт и сохранённая строка перестанет объяснять результат.
- **Цена пересчитана по реальной ставке.** Было 55 кредитов ($0.55) при себестоимости $0.7557 — **каждая генерация приносила −$0.21**. Стало **85 кредитов** за 5 с и **135** за 8 с: против $0.50 и $0.80 оптовой цены это ~41% маржи.
- Ассеты живут на OSS (`*.aliyuncs.com`), а НЕ на API-хосте `*.maas.aliyuncs.com`, и **умирают через 24 часа** — SSRF-аллоулист расширяется только когда провайдер сконфигурирован; копирование в свой сторедж делает общий settle-путь.
- Аудио: у прямого канала переключателя **нет** — Wan 2.7 всегда со звуком, и $0.10/с уже включает его. В отличие от Runware-пути, где `settings.audio: false` режет счёт вдвое, выключать тут нечего.

Требует в `.env`: `DASHSCOPE_API_KEY` + `DASHSCOPE_WORKSPACE_ID` (регион **ap-southeast-1**, Сингапур). Пока не заданы — провайдер выключен, `wan-2-7` скрыт из каталога, загрузка закрыта.

Проверка: `@opencreate/api` 368/368, `@opencreate/contracts` 38/38, `@opencreate/web` 221/221, typecheck + lint чисто. Живая генерация **не прогнана** — нужен ключ.

## [2026-07-13] feat | Seedance 2.0 оживлён через DeepInfra — в обход платной стены ByteDance

Строка `seedance-2-0` висела в каталоге мёртвой: прямой канал отвечает `ModelNotOpen` и не рендерит ни кадра, пока аккаунт не купит resource pack — **минимум $30.10, сгорает за 90 дней, возврата нет**, и купить его в консоли вообще нельзя (он живёт на маркетинговой странице акции). DeepInfra продаёт **ту же модель по той же цене** без активации, предоплаты и минимума.

**Цена проверена, а не принята на веру.** Их заголовочные «$4.30 / 1M tokens» — это ставка **с видео на входе**. Их же строка прайсинга (вытащена из API): `"$4.3/M with video, $7/M without for 480p and 780p; $4.7/M with video, $7.7/M without for 1080p"`. Мы шлём текст или картинку, никогда видео → наша строка **$7/M**, что и есть $0.0070/1k у самого ByteDance. **Дешевле не стало** — исчезла стена. Цена 130 кредитов сохранена (~42% маржи против $0.756).

- **Новый провайдер `deepinfra`** на том же шве `VideoProvider`. Клиент: `integrations/deepinfra/deepinfra-client.ts`, 15 тестов.
- **Главная архитектурная проблема — у них НЕТ поллинга.** API либо синхронный (один HTTP висит все ~60 с рендера), либо webhook. Их доки прямо говорят: способа забрать результат по `request_id` не существует. Наш шов — `submit → jobId → poll`, и на нём держится весь денежный путь (списание при сабмите → 202 → SPA опрашивает → settle один раз).
  **Решение:** `submit()` запускает запрос **detached**, сам чеканит `jobId` и кладёт исход в in-process map; `poll()` читает её. Сервис, реестр и SPA не тронуты.
  **Честная цена решения:** незавершённые задачи живут **в памяти**. Рестарт API их теряет, строка висит `processing`, и её подбирает существующий часовой reaper — деньги возвращаются, но **деплой убивает Seedance-генерации в полёте**. Webhook (публичный колбэк + верификация подписи) — правильный ответ на потом; этот — работающий сегодня и заперт в одном файле.
- **Деньги, снова.** Их схема даёт `duration: -1` = «модель сама решит» (4–15 с), а длительность **драйвит биллинг** — выбранные моделью 15 с стоили бы втрое дороже оплаченных 5. И `resolution` без явного значения не даёт понять, купили мы строку $7/M (480p/720p) или $7.7/M (1080p). Оба пинятся явно. Тот же класс бага, что вырезан вчера из Runware (аудио) и позавчера из Alibaba (дефолт 1080P).
- **`generate_audio: false`** — как у всех: рендер замешивает свою озвучку и музыку поверх, родной саундтрек это оплаченный мусор.
- **Себестоимость приходит от них** — `inference_status.cost` в ответе. Единственный провайдер, который просто говорит, сколько списал; остальных мы оцениваем по прайс-листу.
- AIR-регекс в контракте расширен на `/`: у DeepInfra id — **пути** (`ByteDance/Seedance-2.0`), а не слаги. Все остальные провайдеры матчатся как раньше.
- **`referenceMode` НЕ объявлен, намеренно.** DeepInfra принимает референсы как URL или `asset://`, **не data-URI**, а сервис резолвит фото сущностей именно в data-URI. Объявить возможность до закрытия этой дыры значило бы позволить пользователю тегнуть персонажа, заплатить и получить незнакомца. Следующая работа, а не недосмотр.
- `ark-client` **остаётся** со своими тестами: если пакет когда-нибудь купят, вернуть `provider: 'bytedance'` — правка в одно слово.

Проверка: `@opencreate/api` 434/434, `@opencreate/contracts` 60/60, typecheck + lint чисто. **Живьём не прогнано — нужен `DEEPINFRA_TOKEN`.**

## [2026-07-13] feat | Провайдерская цепочка: одна модель — несколько бэкендов, переключение под капотом

Сегодня один пустой баланс Runware разом убил PixVerse, Seedance 1.5, Kling, Veo, озвучку и музыку. Не деградировал — **убил**. Цепочка превращает «наш провайдер лёг» из аварии в чуть более медленный запрос.

`createFailoverProvider(links)` — сам является `VideoProvider`, поэтому реестр, сервис, денежный путь и SPA видят **один** провайдер. Композиция, а не спецслучай. `seedance-2-0` теперь ходит по цепочке `deepinfra → bytedance`; пользователь выбирает «Auteur» и не знает, чьи GPU его отрисовали.

**Два правила, и оба — про деньги:**

1. **Переключение ТОЛЬКО на сабмите.** Как только бэкенд **принял** задачу, он её рендерит и уже выставляет нам счёт. Переотправка следующему при падении его поллинга означала бы оплату ДВУМ провайдерам за одну генерацию, которую пользователь оплатил один раз, — тихая дыра в марже, растущая с каждой аварией. Падение после принятия = failed + возврат. Точка.
2. **Никогда не переключаться на `content_blocked`.** Модерация детерминирована: та же модель, тот же кадр, другой реселлер — тот же отказ. Проход по цепочке сжёг бы её деньги целиком ради одного «нет», а пользователь ждал бы это «нет» в N раз дольше.

**Как `poll()` находит дорогу обратно.** Сервис сохраняет ОДИН job id и опрашивает по нему позже, возможно после рестарта. Поэтому победивший линк **зашит в сам id** (`deepinfra#abc-123`) и разбирается на входе. Ни новой колонки, ни правки схемы — и правда о том, какой бэкенд реально отработал, остаётся **в строке**, а не в чьей-то памяти. Голый id без префикса (строка, написанная до этой фичи) опрашивает первый линк, поэтому деплой не убивает генерации в полёте.

**Логируется каждый переход** (`event: provider.failover`). Цепочка, молча поглощающая мёртвого провайдера, — это цепочка, которая его **прячет**: фолбэк тихо становится основным путём, и никто не узнаёт, пока не умрёт и он.

**PiAPI сознательно НЕ поставлен первым.** Он экономит $0.021/сек против DeepInfra — 10 центов на клипе 5 с. Их же FAQ описывает модель: *«вы будете использовать пул аккаунтов, управляемый нами... задания будут обрабатываться нашими аккаунтами»* — это автоматизация потребительских подписок, а не оптовый канал. Его $0.13/сек **ниже себестоимости самого ByteDance** ($0.1512/сек при 21 600 ток/с × $0.0070/1k), что возможно только через арбитраж чужих ToS. Механизм провайдер-агностичен, порядок задаётся конфигом — но дефолтом такое не ставится.

Сегодня в цепочке отвечает ровно один линк (ByteDance ждёт покупки пакета), так что ценность пока в **шве**: добавление PiAPI / fal / Replicate — это один файл и одна строка.

Проверка: `@opencreate/api` 446/446 (10 юнит + 2 сквозных на цепочку), typecheck + lint чисто.

## [2026-07-15] restyle | v5 компактный проход: узкий AppShell + CinemaStudio-редактор в один экран

Плотная работа над CinemaStudio началась с плотности. Два слоя изменений, оба — про вертикальный бюджет.

- **AppShell v3.1 (все экраны):** бар 64→44px — `py-3→py-1.5`, контролы `min-h-10→min-h-8`, вордмарк `text-xl→text-base`, подписи `text-sm→text-xs`; `BalanceChip` зеркалит ту же 32px-шкалу (цифра `text-sm`). Выпадающее меню аккаунта НЕ ужато: оверлей — не хром, его 40px hit-area остаётся.
- **Button получил `size="sm"`** (32px, `px-4 py-1 text-xs`) — системный размер для плотного инструментального хрома (тулбары редактора). `md` остаётся полом для страничных CTA: sm — инструмент плотности, не новый дефолт.
- **CinemaStudio-редактор v5:** таймлайн переехал ИЗ НИЗА страницы НАВЕРХ, сразу под строку заголовка — внизу он жил за фолдом, и выбор бита означал две прокрутки на каждую правку; лента — это оглавление фильма, а оглавление идёт первым. Лента ужата в компактную полосу: тайлы `w-40→w-28`, кластер move/delete `size-8→size-7`, well-карта `padding="none"`. Превью-канвас получил потолок `max-h-[42svh]` — без него 16:9-канвас в ~1000px колонне был ~580px и в одиночку выталкивал экспорт и звук за фолд (когда потолок срабатывает, object-contain леттербоксит медиа в тёмном колодце — как настоящий монитор с чужим соотношением). Рейка инспектора 380→360px, sticky-offset `top-20→top-14` (под новый 44px бар), заголовок фильма `text-2xl→text-lg`, канва роута `py-8→py-4`. Все панели (RenderBar, AudioTracks, ShotInspector) — на sm-кнопках и text-xs подписях.
- Обновлены: `docs/frontend/design.md` (строки Button/AppShell/BalanceChip/`/cinema/$filmId`), сайдкары всех 11 задетых файлов, `apps/web/FEATURE.md`.

Проверка: ESLint чисто, `@opencreate/web` 254/254, скриншоты редактора до/после в живом Chrome — заголовок+лента+превью+экспорт теперь в одном экране 1491×812. Известный pre-existing хвост ветки: `tsc` падает на `Timeline.test.tsx` (`entityRefs` optional vs required — незакоммиченная работа в contracts), к этому проходу не относится.

## [2026-07-15] feat | Таймлайн v6: resize + «+»-диалог + hover-контролы

Продолжение компактного прохода — лента переработана вокруг одной идеи: это индекс, его дефолтная цена минимальна, всё остальное вызывается по требованию.

- **Высота ленты — регулируемая, одно значение с двумя ручками.** Селект пресетов (Мелкий/Средний/Крупный → 48/64/88px тайла) для осознанного выбора и drag-разделитель на нижней кромке (`setPointerCapture`, клампы 40–120px, клавиатура ArrowUp/Down ±8) для прямого. Значение живёт в CSS-переменной `--tl-h` на `<ul>` рельсы; тайлы читают её как `aspect-video h-[var(--tl-h)]` — ресайз не перерисовывает ничего кроме самой ленты. Промежуточное значение после drag не совпадает с пресетом — селект показывает «Свой». Разделитель — настоящий `role="separator"` c `aria-valuemin/max/now`: тесты читают доступное значение, не пиксели.
- **Три постоянные кнопки (Добавить кадр · Титр · Раскадровка) схлопнуты в ОДИН «+»,** открывающий модалку с тремя строками-действиями. Три пилюли занимали целый ряд хрома ради действий, нужных несколько раз за фильм; диалог стоит один клик и ноль постоянных пикселей. Выбор действия закрывает модалку до его эффекта — фидбек не должен появляться за несвежим листом.
- **Кластер move/delete у тайла — hover/focus-оверлей** (скрим-бар на нижней кромке тайла), в покое лента — чистый футадж. Кнопки всегда в DOM (Tab и скринридеры достают их всегда; фокус раскрывает бар), а `pointer-events` включаются ВМЕСТЕ с видимостью — невидимый Delete не может съесть клик по тайлу. Кнопки — сиблинги кнопки-тайла (вложенные кнопки — невалидный HTML). Чип длительности переехал в верхний правый угол, бейдж титра — внутрь тайла: ряд текста под тайлом переменной высоты делал ленту рваной.
- **Попутно закрыт pre-existing хвост ветки:** фикстура `Timeline.test.tsx` не имела `entityRefs` — `tsc --noEmit` теперь чист во всех пакетах.
- Новые i18n-ключи `cinema.timeline.{add,size,sizeS,sizeM,sizeL,sizeCustom,resize}` (RU/EN).

Тесты писались первыми: диалоговый флоу (все действия в модалке, ни одного в рельсе и ни одного на экране в покое), resize через селект и клавиатуру (по aria-valuenow), передача раскадровки редактору. Проверка: ESLint чисто, tsc чисто (все пакеты), `@opencreate/web` **257/257**; вживую прогнано в Chrome — модалка, hover-оверлей, селект, drag («Свой») работают.

## [2026-07-15] feat | Блок «Кадр» v6: композер-док у нижней кромки экрана

Инспектор кадра перестал быть боковой рейкой и стал закреплённым нижним композером — форма, к которой prompt-first инструменты приучили пользователей: пишешь внизу, результат сверху.

- **Рейка 360px удалена; сцена (превью · экспорт · звук) — на всю ширину.** Рейка была единственной колонкой, отбиравшей ширину у превью, а длинный промпт жил в тесной коробке в углу. Тело редактора несёт `pb-36`, чтобы плавающий док не накрывал карту звука; без выбранного кадра место дока держит тонкая планка-подсказка — клиренс не прыгает.
- **Промпт — лицо дока:** авторастущая textarea (`field-sizing-content`, Tailwind v4) + ручной `resize-y` + потолок `30svh` — вставленная новелла не съест сцену. Минимум — однострочный док.
- **Тулбар:** компактные селекты Модель + Длительность (ежедневные ручки остаются на виду) и три иконки-тумблера — 📎 персонажи, 🎙 реплика, ⛶ разворот (стиль/кадр/движение/качество + переход + титр + «что увидит модель»). Каждая открывает ОДИН ящик над промптом (`max-h-[40svh]`, скроллится внутри); открытая горит янтарным, `aria-pressed` несёт состояние. Клик по микрофону сразу «взводит» реплику (`hasVoice=true`) — пользователь кликнул микрофон, а не шестерёнку; второй «включить»-пилюлей был бы обруч.
- **Деньги не тронуты:** цепочка save→generate, save→voice, `isVoicing` на оба плеча, деривация живого каста из текста — всё как было; переехала только презентация. Статус клипа + `role="alert"` ошибки — стрип между промптом и тулбаром.
- **`ShotClipFields` удалён** (модель/длительность ушли в тулбар, переход — в ящик ⛶ инлайном); его селекты-обёртки больше нигде не использовались. Новые иконки `PaperclipIcon`/`ExpandIcon`; ключ `cinema.inspector.more`.
- Док — непрозрачная сталь (не стекло): сцена скроллится ПОЗАДИ него, промпт обязан читаться поверх движущегося медиа. `z-30` — под модалками, над контентом.

Тесты писались первыми (`ShotInspector.test.tsx`, 7 шт.): промпт+Save (тело PATCH), пикеры в тулбаре, ящики по `aria-pressed` (каст с веткой «нет персонажей» — фикстура с `referenceMode`), гейт Generate на пустом промпте, видимость 🎙 только при TTS в каталоге. Проверка: ESLint чисто, tsc чисто, `@opencreate/web` **264/264**; вживую в Chrome — авторост на длинном промпте, ящик ⛶, планка-подсказка. Доки: design.md, FEATURE.md, сайдкары (ShotInspector, FilmEditor, icons, Timeline не тронут).

## [2026-07-15] feat | Звук генерации: переключатель на кадре, сквозной тракт, честная цена

Пользовательский переключатель родного звука модели — от тумблера в композере до aac-дорожки в экспортном mp4. Цена решена владельцем: **×2 кредита при включённом звуке** на switchable-моделях.

- **Каталог:** `nativeAudio: 'switchable' | 'always'` + `creditsByDurationWithAudio`. Seedance 1.5 Pro {5:70, 10:140}, PixVerse {5:70, 8:112} — ровно ×2 (замеренная ставка ByteDance); Wan 2.7 — `'always'`, звук уже в цене 85/135. MiniMax/Kling/Veo/Seedance 2.0 — без capability (проверенного переключателя нет): тумблер выключен, API отказывает `audio:true` ДО списания (закон referenceMode).
- **Деньги:** `creditsFor(model, duration, withAudio)` читает with-audio таблицу; сервис валидирует capability до charge; `paramsJson.audio=true` штампуется на любую строку с дорожкой (у 'always' — безусловно) — это provenance для рендера.
- **Рендер:** сегмент с `shot.audio && params.audio` вносит свою `[i:a]`-дорожку в микс — atrim к окну шота, adelay к вычисленному старту сегмента (кроссфейд стартует внутри перехлёста, как и картинка), amix вместе с музыкой/озвучкой. Никакого ffprobe: доверяем строке, а не файлу; шот-флаг без provenance не маппит несуществующий стрим (это убило бы весь рендер).
- **Адаптеры:** `runwareExtrasFor(..., audio=false)` переводит флаг в диалекты семейств; дефолт остаётся false — молчаливый вызов никогда не платит ×2. DeepInfra/ark не тронуты (цена звука Seedance 2.0 не проверена).
- **Композер:** иконка-динамик (STATE-тумблер, янтарный = вкл) в тулбаре дока; aria-label несёт «цена ×2» на switchable, disabled + пояснение там, где звука нет. `shot.audio` (новая колонка, микро-миграция ALTER TABLE) хранит намерение; `composeShotClipInput` шлёт `audio:true` только когда модель заявила capability — устаревший флаг не может ни словить 400, ни удвоить цену.
- **Попутный фикс:** скрим-бар hover-оверлея на тайле съедал клики по нижней трети тайла (выбор кадра молча не срабатывал — найдено живым кликом). Теперь pointer-events включаются на самих кнопках, фон бара прозрачен для кликов.

Тесты: creditsFor with-audio + инвариант «у каждого switchable полная таблица», адаптер (audio:true по семействам), чистые argv рендера (offset'ы, kroссфейд, микс с треками), интеграционный прогон против настоящего ffmpeg (клип со звуком → aac в экспорте), composeShotClipInput (3 кейса), композер (тумблер+PATCH, disabled без capability). Итог: contracts 60/60, api **455/455**, web **269/269**, tsc + ESLint чисто. Живьём: тумблер на Swift (switchable) включается, каталог отдаёт nativeAudio, миграция накатилась на живую базу.

## [2026-07-15] restyle | Композер v6.1: стеклянный промпт, модалка моделей, слайдер длительности

Три правки владельца по свежему доку:

- **Промпт-инпут — iOS-стекло:** плита `GLASS_SURFACE` из кита (полупрозрачная заливка, backdrop-blur/saturate, яркая ВЕРХНЯЯ грань как отражение линзы — безградиентный ответ на sheen, внутреннее кольцо), плавает `mx-2 mt-2` внутри стального дока. Один рецепт с Card/Modal — материалы не разъезжаются.
- **Тулбар без label:** селекты «Модель»/«Длительность» заменены. Модель — чип с текущим выбором (логотип + имя + ▾), открывающий БОЛЬШУЮ модалку `ModelPickerModal`: строки с брендовыми знаками, тир-чипами, честными провайдер-лейблами, описаниями и тарифами (amber-ring на выбранной; выбор коммитит и закрывает). Ради неё `modelPresentation` и `ProviderMark` ПЕРЕЕХАЛИ из Generator в shared (Cinema не может импортировать Generator; статический lookup — не бизнес-логика). Длительность — ступенчатый range-слайдер по редакторским стопам 2/3/5/8/10с: значение слайдера — ИНДЕКС стопа (каждая насечка — реальная тарифицируемая опция), `aria-valuetext` произносит секунды, чип рядом показывает их.
- Тесты обновлены под новое поведение: слайдер (role slider + сохранение выбранного стопа в PATCH), модалка модели (открытие, богатые строки, выбор закрывает и одевает чип). ESLint/tsc чисто, web **271/271**. Живьём: стекло, чип Swift→Cinema через модалку, слайдер — проверено в Chrome.

## [2026-07-15] fix | Композер v6.2: промпт растёт ВВЕРХ

Владелец поймал UX-инверсию: нативный `resize-y` растил textarea тягой ВНИЗ, а док прибит к нижней кромке вьюпорта — рост может идти только вверх, жест воевал с раскладкой.

- `resize-y` у промпта убран. Вместо него ручка на ВЕРХНЕЙ кромке — та же клавиатурно-доступная анатомия `role="separator"`, что у высоты таймлайна: drag вверх = больше, вниз = меньше (pointer capture, дельта 1:1), стрелки ±16px (кламп 40–480), даблклик — возврат в авторежим.
- Два режима размера: `promptHeight === null` = АВТО (`field-sizing-content` следует за текстом, потолок 30svh); число = ручной — явная высота побеждает, авто-классы отходят в сторону, чтобы не воевать. Первый drag стартует от живой высоты элемента (`offsetHeight`), а не от константы.
- Ловушки по пути: чтение ref в рендере (`aria-valuenow`) — нарушение hooks-правила, ушло в состояние; `offsetHeight` в jsdom равен 0 — `||` вместо `??`.

Тест писался первым (клавиатурное зеркало драга по aria-valuenow). ESLint/tsc чисто, web **272/272**; живьём в Chrome: тяга ручки вверх на 150px растит стеклянное поле вверх, док поднимается над сценой.

## [2026-07-16] feat | Редактор v7: настоящий монтажный верстак + экспорт в меню «⋯»

Две директивы владельца одним проходом: «Экспорт» уходит со сцены в меню «⋯», таймлайн — вниз, как настоящая монтажная дорожка со звуком под видео.

- **Одна колонка на высоту вьюпорта, без скролла страницы:** сцена (заголовок · транзиентный статус экспорта · превью) скроллится внутри себя; ВЕРСТАК прибит снизу — композер над ПАНЕЛЬЮ ДОРОЖЕК, как в настоящем монтажном цехе. Композер потерял fixed-обёртку (колонка сама владеет прибивкой).
- **Дорожки на одном времени:** линейка (тик каждую секунду, цифра каждые 5с), видео-лента — слот кадра ШИРИНОЙ ∝ длительности (10-секундный бит зримо стоит двух пятисекундных; `PX_PER_SEC=24`, `--shot-w`), и АУДИО-ДОРОЖКА сразу под футаджем: музыкальные подложки — янтарные бары от старта до конца фильма (реальная длина живёт в медиа, клиент её не знает), реплики — зелёные чипы ровно на своём `startMs` (под своим битом), удаление по ховеру. Все три слоя в ОДНОМ горизонтальном скролле — разъехаться не могут.
- **Карта «Звук» умерла:** добавление музыки/озвучки переехало в «+»-диалог таймлайна (строки-формы: Generate = одно платное действие — генерация клипа + привязка трека). `AudioTracks.tsx` удалён, логика поглощена Timeline.
- **Экспорт в «⋯»:** пункт «Собрать mp4» первым в меню фильма (скрыт, пока рендер в полёте — закон меню: недоступное убирается, не дизейблится); `RenderBar` стал чистым транзиентным статус-стрипом (idle = ничего; прогресс → зелёный Download → спокойный retry). Состояние экспорта поднято в FilmEditor — меню и стрип читают одну правду.
- **Честно не сделано:** горизонтальный drag звука (нужен PATCH startMs в API — его нет) — следующий шаг для «переставь звук мышкой».

Тесты: RenderBar переписан под чистые пропсы (idle=null, прогресс, download, retry, kick-off-fail), Timeline получил кейсы аудио-дорожки (лейблы+DELETE) и формы музыки через «+» (POST /generations → POST /audio), фикстуры обновлены. ESLint/tsc чисто, web **275/275**. Живьём в Chrome: линейка, пропорциональный тайл, дорожка звука, меню «Собрать mp4/Настройки/Удалить», «+» со всеми пятью действиями — проверено.

## [2026-07-16] feat | Dev-only супер-админ + fixed-композер и прозрачная капсула

Три директивы владельца: (1) композер на /create — держать `fixed` («мы с тобой вёрстку год исправляем»), (2) капсула прозрачная целиком, не только textarea, (3) тест-юзер admin/admin — супер-админ, существующий только в dev.

- **Композер прибит по-настоящему:** обёртка в `_shell.create.tsx` сменила `absolute bottom-0` (держалось, только пока `h-[calc(100dvh-4rem)]` мэйна точно совпадал с вьюпортом) на `fixed inset-x-0 bottom-0` — док к вьюпорту безусловно. Сайдбара в шелле нет, центровка не съезжает; обёртка осталась click-through.
- **Капсула прозрачна:** `CAPSULE_CLASS` в ChatComposer больше не носит `GLASS_FLOATING` — ни заливки, ни blur, ни тени; общий рецепт стекла в `surfaces.ts` не тронут (правка вчерашняя, 2026-07-15).
- **Dev-админ:** `admin@dev.local` / `admin`, `user.role='super_admin'` (новая колонка, TEXT DEFAULT 'user', DDL+микромиграция), сид на буте строго под `nodeEnv==='development'` у корня композиции. Пароль 5 символов ЖИВЁТ: better-auth 1.6 проверяет minPasswordLength только на sign-up/change/reset — сид пишет scrypt-хеш напрямую (`auth.$context.password.hash`), sign-in проверяет только хеш. Прямой инсерт обходит user.create.after-хук → бонус выдан явно (админ должен уметь тестить денежные пути). `role` как additionalField `input:false` — клиент не может самоназначиться.
- **Форма логина:** min(8) на пароле в режиме ВХОДА был строже API и запирал легитимные короткие креды — теперь login=min(1), register=min(8) (зеркало better-auth).

Тест писался первым (5 кейсов: вход в dev, роль на юзере, бонус, 401 в test/production, идемпотентность второго бута через новый db-оверрайд buildTestApp). API **460/460**, web Auth 13/13, tsc/ESLint чисто. Живьём: `POST /api/auth/sign-in/email` на :8787 → `{role:'super_admin', credits:200}`.

## [2026-07-17] fix | Композер вернулся на глаза: стекло на /create, автовыбор кадра в /cinema

Владелец сообщил две пропажи: «куда чат пропал на странице кино» и «на /create поле — бэкграунд просто пропал». Обе — следствия вчерашних директив, живьём оказавшихся хуже, чем на бумаге.

- **/create — капсула снова в стекле (реверс прозрачности от 2026-07-15):** полностью прозрачная капсула клала плейсхолдер, цену и стрип настроек ПРЯМО на карточки ленты — нечитаемо, как только карточка подъезжала под композер. `CAPSULE_CLASS` снова носит `border` + `GLASS_FLOATING`; fixed-позиционирование (директива 2026-07-16) не тронуто.
- **/cinema — первый кадр выбран по умолчанию:** верстак v7 показывал композер только после клика по плитке, до того — тонкую строчку-подсказку; владелец прочитал это как «чат исчез». Выбор теперь ДЕРИВИРОВАННЫЙ, без эффекта: `selectedShot = find(selectedShotId) ?? shots[0]`. Явный клик всё ещё побеждает; удаление выбранного кадра откатывает на первый; фильм без кадров сохраняет подсказку. `Timeline` и `isSelectedVoiced` читают эффективный выбор — подсветка плитки всегда совпадает с кадром в композере.

Тест писался первым (`FilmEditor.test.tsx`: композер открывается с драфтом кадра 1 без клика; ноль кадров → подсказка). ESLint/tsc чисто, web **277/277**. Живьём в Chrome: /create — стеклянная капсула над лентой; /cinema — новый фильм → «+ Добавить кадр» → композер на верстаке сразу, плитка 1 подсвечена.

## [2026-07-17] fix | Композер в /cinema — самой нижней кромкой экрана (чат-позиция)

Владелец: «поле куда пишут промпты сделай fixed снизу». В верстаке v7 композер стоял НАД дорожками — промпт визуально висел посреди страницы.

- **Порядок верстака перевёрнут: ДОРОЖКИ выше, композер ПОСЛЕДНИЙ** — прижат к нижней кромке вьюпорта. Колонка редактора уже прибита к высоте экрана (`h-[calc(100svh-76px)]`), так что последний элемент потока = честный fixed-низ без position:fixed, z-index и игр с клиренсом, которые были у v6-шелла. Та же чат-анатомия, что на /create.
- Внутренности композера и так растут ВВЕРХ (дровер над промптом, ручка ресайза на верхней кромке) — нижняя посадка органична. Строчка-подсказка (ноль кадров) сидит в том же слоте. Скелет загрузки зеркалит новый порядок.

Тест писался первым (`FilmEditor.test.tsx`: composer-region идёт ПОСЛЕ timeline-region в DOM). ESLint/tsc чисто, web **278/278**. Живьём в Chrome: сцена → таймлайн → промпт с тулбаром у самого низа экрана.

## [2026-07-17] fix | Композер /cinema — position:fixed док; таймлайн без хрома, «+» в рейле

Три директивы владельца одним проходом: (1) «чат сделай fixed по позиции, чтобы размеры экрана не занимал», (2) убрать заголовок «Таймлайн», (3) убрать селект размера и перенести «+» внутрь блока таймлайна понятной иконкой.

- **Композер — настоящий fixed-док:** вынесен из потока колонки в `pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4 xl:px-6` (внутренний div возвращает клики). Рост дока (дроверы, ресайз промпта — оба растут вверх) теперь НАКЛАДЫВАЕТСЯ на сцену/дорожки, а не сжимает их; колонка резервирует только высоту сложенного дока (`pb-28` — колонка не скроллится, иначе дорожки навсегда под доком). z-40 — под модалками (z-50). Сцена стала заметно выше.
- **Таймлайн без хрома:** строка «Таймлайн + Размер + плюсик» удалена целиком. aria-label секции остался (доступное имя). Селект пресетов s/m/l мёртв — высота только ручкой-сепаратором (drag + стрелки), дефолт 64px.
- **«+» — плитка в рейле:** дашед-плитка `AddTile` (иконка + подпись «Добавить», высота как у тайлов через `--tl-h`) стоит сразу после последнего шота — там, где появится результат; на пустом фильме — рядом с подсказкой. Сиблинг `<ul>`, не listitem: список остаётся «шотами» для скринридеров и тестов. Сам диалог «+» не тронут.

Тест писался первым (fixed-обёртка у композера; ресайз-селект-тест удалён вместе с фичей). ESLint/tsc чисто, web **278/278**. Живьём в Chrome: сцена выше, дорожки чистые, «+ Добавить» в рейле, промпт-док у нижней кромки.

## [2026-07-17] restyle | Модалка выбора модели — карточная галерея с мини-демо

Владелец: «модалку выбора модели сделай красивой — карточки в ряд по 3, с мини-видосиками демонстраций».

- **Карточная сетка:** `lg:grid-cols-3` (адаптив до одной колонки), скролл внутри (`max-h-[70svh]`). Карточка = демо-плита 16:9 сверху (медиа-колодец `bg-abyss`) + имя, базовый тариф, честный провайдер, описание; чип тира ЛЕЖИТ на плите в пилюле `bg-void/70`. Выбранная — янтарное кольцо, вся карточка (включая видео) — одна кнопка, aria-pressed.
- **Демо-контракт самообслуживания:** каждая карточка рендерит `<video muted loop autoplay playsinline preload="metadata" src="/model-demos/<id>.mp4">`; брендовая плашка (ProviderMark на abyss) всегда под ним, видео проявляется через `onCanPlay`. Нет файла → чистая брендовая карточка; кинул mp4 в `apps/web/public/model-demos/` → карточка ожила без кода.
- **Честные демки:** wan-2-7 и seedance-1-5-pro получили реальные 3-секундные 480p-лупы (29KB/58KB), нарезанные ffmpeg-static из НАСТОЯЩИХ локальных генераций этих моделей (никаких чужих клипов под чужим именем). Остальные шесть — брендовые плашки до появления своих демок.
- **Предел харнесса:** автоматизированная вкладка claude-in-chrome не воспроизводит НИКАКОЕ медиа (даже blob залипает на readyState 0) — плейбек проверен ffmpeg-декодом (0 ошибок) и HTTP 206 range-ответами; глазами — в обычной вкладке.

Тест писался первым (`ModelPickerModal.test.tsx`: карточка на модель с именем/тарифом; video-слот `/model-demos/<id>.mp4` у каждой; выбранная pressed; клик коммитит и закрывает). ESLint/tsc чисто, web **281/281**.

## [2026-07-18] feat | Три форматных шаблона: «Фильм», «Сериал», «Аниме» (полка «Форматы»)

Владелец работает через Cinema+Wan и попросил готовые шаблоны «как фильм / как сериал / как аниме» — с готовыми настройками и промптами.

- **Новая категория контракта `format`** (третья полка рядом с brainrot/animation, ярлык «Форматы» в ru/en локалях): LOOK/GENRE-каркасы — стартовая сетка, которую переписывают в редакторе, а не готовая шутка. Полка ведёт галерею /templates.
- **«Фильм» (`film`)** — грамматика голливудского трейлера: холодное открытие → герой → угроза → эскалация → кульминация → финальный кадр + бесплатная титульная карта. Ручки: герой (детектив/космонавт/самурай), мир (неон-мегаполис/пустыня/северный порт), название (текст — только в титул и финальную реплику). Голос Nikolai, трейлерный musicPrompt.
- **«Сериал» (`serial`)** — серия прайм-тайм драмы: рекап-карта → затишье → находка → конфронтация → слёзы → клиффхэнгер → «Продолжение следует…». Ручки: место (кухня/офис/больница), находка (письмо/второй телефон/фото; spoken-формы В РОДИТЕЛЬНОМ падеже — реплика «…из-за этого {{find}}» склоняется сама, не ломать).
- **«Аниме» (`anime`)** — боевой эпизод сёнена, styleId 'anime': город на рассвете → проход героя → враг → пробуждение силы (сакуга) → битва → тишина + каноничная карта «Продолжение следует». Ручки: герой (школьник с катаной/девушка-маг/киборг-ронин), стихия (огонь/молния/лёд — красит два зрелищных бита).
- **Все три: 16:9, биты по 8с, тиры draft=pixverse-v6 / standard=wan-2-7 / premium=veo-3-1-fast.** wan-2-7 стандартом сознательно: держит 8с@16:9, свой звук, и единственный из видео-моделей берёт РЕФЕРЕНСЫ персонажей (r2v) — тегнутый герой один и тот же от бита к биту (tierNote прямо говорит «тегай героя из Сущностей»).

Инварианты каталога покрыли шаблоны автоматически (плейсхолдеры объявлены/использованы, текст-ручки не попадают в визуальные промпты, голоса валидны, каждый тир держит аспект и длительности). API **484/484**, web **281/281**, контракты и tsc/ESLint чисто. Живьём: полка «Форматы» ведёт /templates, модалка «Фильма» — раскадровка 7 битов · 51с, ручки и тиры на месте.

## [2026-07-20] feat | Modular 3D Assets — визард целиком: концепт → части → меши → сборка

ADR `modular-3d-assets` переведён из `proposed` в **accepted** (апрув владельца). Расхождение, вскрытое на старте: бэкенд по этому ADR был уже построен и зелен до формального апрува — гейт архитектуры проехали, код опередил статус. Зафиксировано в самом ADR, чтобы история не врала.

- **Фронт достроен по Appendix F плана целиком** (FG0–FG7), тремя параллельными потоками, разведёнными по файлам и по namespace локалей: каркас+библиотека+оболочка визарда, стадии частей/экстракции/мешей, модельный слой и компоненты сборки.
- **Стадийный, а не постраничный визард:** один роут `/assets/$assetId`, активную стадию выводит чистая `deriveStage` из состояния агрегата. Визард садится на САМУЮ РАННЮЮ незакрытую стадию — одна недоизвлечённая деталь держит на «Частях», даже если соседи уже мешатся.
- **Решение владельца по деньгам (2026-07-20):** одиночный `mesh` закрыт `SpendConfirmModal` — самый дорогой шаг на деталь, нужен паритет по мисклику. Одиночный `extract` остался click-to-spend: дешёвый и многократный (до 12 частей), диалог на каждый клик превратил бы сетку в кликер. Батч «извлечь всё» как был под подтверждением. Пинится тестом: голый клик по мешу НЕ зовёт `/mesh`.
- **Чип «возвращено» — только на провалившейся ГЕНЕРАЦИИ** (списание было, сервер вернул). Отклонённая мутация (`insufficient_credits`) не списывала ничего и чипа не получает — иначе интерфейс врал бы о возврате.
- **Ленивая граница three.js проверена, а не предположена:** маркеры `WebGLRenderer|BufferGeometry|GLTFLoader` — 8 попаданий в `AssemblyStage-*.js` (1.08 MB) и НОЛЬ в главном бандле, `Assets3D-*`, `Cinema-*`.
- **Продакшен-баг, пойманный компонентным тестом поверх зелёного модельного слоя:** `GLTFLoader.load()` бросает СИНХРОННО — тришный `FileLoader` конструирует `Request` заранее, поэтому на нераспарсиваемом URL исключение летит до появления колбэков и `onError` не срабатывает никогда. Без перехвата бросок улетал из эффекта и React размонтировал вьюер: один битый URL гасил всю сцену вместо одной детали. Починено, закрыто тестами.
- Постеры fallback без WebGL берутся из **image**-генерации детали, не из меша: у меша в `mediaUrls[0]` лежит GLB, который `<img>` не отрисует.
- Известное ограничение (записано намеренно): `useLivePartGenerations` без интервала опроса — корректно, потому что `deriveStage` пускает на «Сборку» только когда все детали `ready`, но перекаченный меш прямо на этой стадии сам не обновится до инвалидации агрегата.

Гейт перепроверен вручную, не со слов агентов: web **435/435** (60 файлов), tsc/ESLint чисто, локали `assets3d` 138↔138 без односторонних ключей, файлов >500 строк нет, запрещённые паттерны только в тексте сайдкара про сам запрет. Живьём в браузере ещё не прокликано.

## [2026-07-20] fix | CinemaStudio — звук чинится, рендер перестаёт теряться, отказы обретают причину

План CinemaStudio был отмечен на 100%, поэтому «добить» означало найти недокументированные дыры. Два независимых аудита (возможности/бэкенд и интерфейс/состояния) сошлись на одном и том же нечестном тесте — хороший признак, что остальное найдено, а не выдумано.

### Прикрепление аудио было сломано ВСЕГДА, за деньги

Клиент постил генерацию (асинхронную, 202 `processing`) и **сразу** постил прикрепление; сервер требовал `succeeded` и гарантированно отвечал 400. Первый POST уже списал кредиты. Два комментария в коде буквально противоречили друг другу: клиент утверждал «рендер пропустит неготовый трек, ничего не теряется», сервер — «проверка, которую комментарий выше всегда ОБЕЩАЛ, но никогда не выполнял». Сервер когда-то починили от немого фильма, клиент под починку не обновили: тихий отказ стал громким.

Хуже, чем казалось: возврата нет (возврат срабатывает на провале, а генерация *успешна*), оплаченный mp3 недостижим как дорожка, а в галерее попадает в ветку `<img>` и рисуется битой плиткой.

**Решение — вариант C (владелец подписал переписывание регрессионного теста):** статус-гейт снят с `addAudio`, `buildPlan` остался ЕДИНСТВЕННОЙ точкой принуждения — то есть защита переехала, а не исчезла, немой экспорт по-прежнему невозможен. Ключевой аргумент: **шоты уже так работают** — прикрепляют ещё `processing` генерацию и показывают живой статус. Аудио вело себя наоборот, и это была настоящая нестыковка. Взамен снятого запрета ожидание стало ВИДИМЫМ: живой статус дорожки в таймлайне (слово несёт статус, цвет лишь усиливает; провал перебивает цвет типа дорожки — сломанный трек это блокер, а не музыка, которая почему-то красная) плюс состояние ошибки в диалоге добавления.

### Рендер терялся при перезагрузке и умел заклинивать редактор

`renderId` жил в стейте компонента, списка рендеров на сервере не было — mp4 оставался на диске, id исчезал навсегда. Тем же корнем запускались параллельные рендеры одного фильма. Плюс отдельный баг: выход из опроса проверял `data === undefined`, недостижимое из-за засева тела 202 — при стабильно падающем опросе «processing 0%» навсегда, а пункт «Экспорт» ИСЧЕЗАЛ из меню (недоступные действия удаляются, а не гасятся), запирая пользователя без объяснений.

- `latestRender` на детали фильма (nullable, не optional: «никогда не экспортировали» — реальное состояние, отличное от «ещё не загрузили»); ссылка на готовый mp4 на экране сразу после F5.
- Защита от параллельных экспортов — **на сервере** (409 `conflict`), потому что UI-флаг знает только свою вкладку. Код `conflict`, а не `validation_failed`: запрос валиден, его запрещает состояние фильма.
- Выход из опроса переехал на счётчик неудач, сбрасываемый любым успехом. Кнопка называется **«Проверить снова»** и подключена к обновлению статуса, а НЕ к повтору экспорта: когда рендер просто потерян из виду, запуск второго ffmpeg — единственное, чего делать нельзя.

### Отказ экспорта: 7 сообщений → 10 причин с действиями

Сервер формировал внятные причины, интерфейс схлопывал все в одну строку. Расщеплены две склейки, где под одним текстом жили противоположные инструкции («подождать» против «удалить»): аудио-ветка на четыре причины, шотовая — на «генерится» против «провалился». Enum положен в `film.ts`, а НЕ в `errors.ts`: `apiErrorCodeSchema` — транспортная таксономия на всё приложение, и её `Record<ApiErrorCode, string>` заставил бы каждое приложение завести киношную строку. Конверт расширен тремя ОПЦИОНАЛЬНЫМИ полями; совместимость не утверждена, а измерена прогоном настоящего zod: старая схема лишние ключи терпит, но срезает — значит сервер можно выкатывать первым с нулевым риском. Субъект отказа теперь именуется («Кадр 4», «Музыка») и к нему можно прыгнуть; доскроллить до кадра за экраном — осознанно отложено (у таймлайна нет императивной ручки скролла), записано как решение, а не недосмотр.

### Чему научил этот проход

**Структурное утверждение поймало баг, который текстовое пропустило.** Ветка «рендер провалился» не исключала случай «отказано», поэтому проваленная строка, пережившая перезагрузку (благодаря только что добавленной персистентности!), рисовалась ВМЕСТЕ со свежим отказом: полоса противоречила сама себе и возвращала врущую кнопку повтора прямо под текстом о том, что повтор не поможет. Тест на текст остался бы зелёным; поймало требование «кнопок нет вообще».

**Непокрытое тестом поведение опасно не тем, что ломается, а тем, что ломается тихо.** Единственный незакреплённый путь (409 → «уже экспортируется») оказался и самым опасным местом при параллельной правке: сужение тернарника уронило бы его в `null`, полоса бы не отрисовалась вовсе — дед-клик при зелёных типах, линте и всех тестах.

Гейт проверен вручную: contracts **70/70**, API **526/526** (53 файла), web **454/454**, tsc/ESLint чисто, локали cinema en/ru идентичны (4 «односторонних» RU-ключа — легитимные формы множественного числа, не трогать).

**Долг:** `apps/api/src/modules/films/service.ts` — **801 строка** при лимите 500 (667 ещё до этой работы). Не разделён намеренно: файл правили двое, раскол посреди поведенческих изменений — верный мердж-конфликт. Отдельная задача на момент одного владельца.

**Не сделано (осознанно, вне объёма):** фильм по-прежнему нельзя услышать до оплаты экспорта — `PreviewPlayer` смонтирован `muted` и в модуле нет ни одного `<audio>`; громкость и сдвиг дорожки write-once (PATCH нет), слишком громкую подложку можно только удалить и оплатить заново; у самого дорогого действия в приложении (генерация клипа) нет ни цены на кнопке, ни подтверждения; провал клипа говорит «failed» без причины и без слова «возвращено».

## 2026-07-21 — Улучшатель промптов: `POST /api/prompt/enhance` (DeepSeek-V3)

Черновую, любую по языку идею кадра сервис переписывает в ОДИН плотный английский кинопромпт для Wan (text-to-video) — через `deepseek-ai/DeepSeek-V3-0324` на OpenAI-совместимом чат-эндпоинте DeepInfra. Два потребителя: композер Cinema и кнопка «Смягчить и повторить» после `content_blocked`.

**Два режима.** `enhance` (по умолчанию) — просто лучше. `soften` — то же, но дополнительно переписывает ПРОЧЬ то, что режет фильтр провайдера (насилие/кровь, откровенное, реальные публичные лица по имени, политика), сохраняя сцену и действие. Одна модель, один парсер — режим меняет только системный промпт.

**Скопирован паттерн `storyboard.ts` буквально**, потому что он уже решил ровно эти задачи: гейт на опциональном `DEEPINFRA_TOKEN` (не задан → чистый `provider_error` 502, бут здоров), ВНЕДРЯЕМЫЙ `complete()` — тесты не ходят в сеть, а JSON-ответ модели мы парсим и валидируем САМИ (снять ```json-забор + zod), так что кривой ответ — это чистый 502, а не пустой промпт в композере. Сырой текст провайдера до клиента не доходит.

**Правило кастинга — в БАЗОВОМ системном промпте, значит держит ОБА режима:** любой токен вида `[[eN]]` копируется ДОСЛОВНО, на месте, без перевода/переименования. Шот-промпт носит непрозрачные ссылки на персонажей; изуродовать одну — тихо сломать кастинг ниже по потоку. Закреплено тестом в обоих режимах.

**Денежный путь не тронут — конструктивно.** Сервис берёт только `{ deepinfraToken, complete? }` — ни базы, ни ledger, ни generation-сервиса, так что списать кредиты он не может физически. HTTP-тест это фиксирует: баланс до и после вызова равен. Session-guarded (`requireUser`), НЕ scoped по фильму (чистая трансформация текста), свой строгий бакет 20/мин.

**RED → GREEN.** Тесты писались первыми и падали как надо (module-not-found), затем реализация. Contracts **81 → 89** (+8: границы длины текста 1..2000, enum режима, `.min(1)` на выходном промпте), API **538 → 551** (+13: parse со снятием забора и отказом кривого/пустого ответа; enhance переписывает; soften несёт safety-блок и возвращает смягчённое; `[[e1]]` выживает в обоих режимах; отсутствие ключа → `provider_error`; HTTP — 401 без сессии, 400 на пустой текст, 502 при незаданном токене + баланс не изменился). Оба typecheck и lint чисто.

**Решение (судейский вызов):** задача называла гейт «requireSession», в коде декоратор — `app.requireUser`; использован фактический. И DeepSeek-**V3-0324**, НЕ R1: для детерминированного JSON-переписывания видимые рассуждения R1 — это только лишняя латентность и токены, которые пришлось бы срезать.

## 2026-07-22 — Улучшатель промптов: цепочка провайдеров с бесплатным фолбэком (Groq)

DeepInfra ушёл в минус («You need positive balance to do inference») — и улучшатель, построенный на одном провайдере, просто погас. Одиночный `complete()` обобщён в УПОРЯДОЧЕННУЮ цепочку: DeepInfra (DeepSeek-V3) первым как основной (платный/лучше при балансе), **Groq (llama-3.3-70b-versatile) — бесплатный фолбэк**. Сервис пробует по порядку и берёт первого, кто (а) сконфигурирован и (б) ответил; на ЛЮБОМ провалы провайдера (нет баланса, 4xx/5xx, сеть, кривой ответ) — проваливается к следующему. Все упали → `provider_error`; никого не задано → `provider_error`, как и было.

**Groq — тот же OpenAI-совместимый вызов**, отличается только URL+модель, поэтому один помощник `callOpenAiChat` обслуживает обоих. `parseEnhanceResult` вызывается ВНУТРИ попытки каждого провайдера, так что кривой ответ DeepInfra тоже уводит на Groq. Оба режима, тот же системный промпт, то же правило `[[eN]]` — фолбэк ведёт себя идентично.

**Санитизация усилена:** `callOpenAiChat` НИКОГДА не читает тело ответа провайдера в брошенную ошибку — только HTTP-статус или нейтральную категорию (`HTTP 402` / `network error` / `empty response`). Значит текст «нет баланса» не утечёт ни в лог фолбэка (`warn`, `event: prompt.provider_failed`), ни в (фиксированный) конверт клиенту. Денежный путь по-прежнему нетронут конструктивно — сервис так и не берёт ни базу, ни ledger.

**Новый ключ `GROQ_API_KEY`** (`config.ts`, опциональный, как `DEEPINFRA_TOKEN`) + строка в `.env.example` (бесплатный ключ с console.groq.com; значение в `.env` не выдумано). ЛЮБОЙ из двух ключей в одиночку включает эндпоинт.

**RED → GREEN.** Тесты первыми, падали как надо (`buildEnhanceChain is not a function`; сервис игнорировал `completers`). API **551 → 560** (+9: `buildEnhanceChain` конфиг/порядок ×4; Groq-адаптер строит корректный запрос + бросает санитизированную ошибку на 402; фолбэк ко второму провайдеру с логом; фолбэк на кривом ответе; все упали → `provider_error`; только Groq (DeepInfra отсутствует) → есть вывод end-to-end через реальную сборку цепочки над мок-fetch). Contracts **89** без изменений (контракт тот же). Typecheck и lint чисто.

**Проверено:** с ТОЛЬКО `GROQ_API_KEY` (DeepInfra отсутствует/падает) улучшатель выдаёт результат — тест `buildEnhanceChain(null, 'gk', mockFetch)` → `['groq']`, прогнан через сервис, отдаёт промпт.

## [2026-07-22] fix | Длительность видео актуализирована до реальных лимитов провайдеров

Владелец: «почему у нас всего 10 секунд, Higgsfield даёт 15?». Расследование (доки провайдеров + живой каталог Higgsfield API) показало: **это был наш заниженный конфиг, а не лимит модели/провайдера**. dashscope/Runware-адаптеры шлют `duration` без клампа — резали нас только таблицы каталога и захардкоженный слайдер.

Два источника длительности были рассинхронены и оба капали на 10:
- каталог `durationOptions` (per-model) — к ним генерация прижимает выбор;
- фронт `SHOT_DURATIONS_SECONDS = [2,3,5,8,10]` — слайдер таймлайна, потолок того, что вообще можно попросить.

**Проверенные лимиты и новые значения** (каждая модель держит свой посекундный тариф; старые значения не тронуты, длинные добавлены — все прежние ценовые тесты держатся):
- wan 2.7 (Alibaba, 2–15) → `[5,8,10,15]`, 17 кр/с (10:170, 15:255)
- Seedance 1.5 Pro (Runware, 4–12) → `[5,8,10,12]`, 7 кр/с (+ звук ×2)
- Seedance 2.0 (DeepInfra, 4–15) → `[5,10,15]`, 26 кр/с (15:390)
- Kling 3.0 (Runware, до 15) → `[5,10,15]`, 16 кр/с (15:240)
- PixVerse V6 (Runware, 1–15) → `[5,8,10,15]`, 7 кр/с (+ звук ×2)
- Veo 3.1 (Runware) → `[4,6,8]` — 8 реальный потолок (17.5 кр/с)
- MiniMax `[6,10]` и self-host wan-2.2 `[5]` — без изменений
- Слайдер → `[2,3,5,8,10,12,15]`

Перелинная полоска прижимается к максимуму модели при генерации (`nearestDuration`), так что 15 на слайдере честны для всех: у Veo просто сгенерится 8. Тестами вперёд (6 RED → GREEN в catalog.test). Гейт: API **566/566**, web **495/495**, tsc/ESLint чисто, живой `/api/catalog` отдаёт `wan-2-7: [5,8,10,15]`. Точный потолок канала перепроверяю живым вызовом до зашивки, чтобы не поймать 400.

## [2026-07-24] fix | Google-вход разблокирован: раздельные rate-limit вёдра на /api/auth/*

**Симптом**: клик «Продолжить с Google» на /login ничего не делал. **Корень**: одно строгое ведро `10/min per IP` покрывало ВЕСЬ `/api/auth/*` — SPA опрашивает `get-session` на каждом переходе/фокусе, съедала бюджет, и `POST /sign-in/social` (и даже `GET /callback/google` от Google) получали 429. Вторая половина бага — фронт: `handleGoogleSignIn` был fire-and-forget (`void signIn.social(...)`), ошибка проглатывалась, кнопка выглядела мёртвой.

**Фикс**:
- `apps/api/src/modules/auth/plugin.ts` — роут разделён на два: `POST /api/auth/*` держит строгие `10/min` (credential stuffing), `GET /api/auth/*` — без per-route конфига, действует только глобальный `300/min` (чтение сессии без кредов + OAuth-callback).
- `apps/web/.../AuthForm.tsx` — `handleGoogleSignIn` теперь await'ит `signIn.social` и выводит `{ error }` через тот же `mapServerError` → role="alert" баннер, что и email-вход.

**Тесты вперёд (RED→GREEN)**: `rate-limit.test.ts` — 25 GET get-session подряд все 200 и не съедают POST-бюджет; `AuthForm.test.tsx` — упавший social-вход показывает локализованный alert. Гейт: API **574/574**, web **650/650**, tsc чисто. Живая проверка: `sign-in/social` → 200 c URL Google, accounts.google.com принимает redirect_uri (`http://localhost:5173/api/auth/callback/google`) — экран выбора аккаунта открывается.

## [2026-07-28] fix | «Не могу войти»: ввод, а не код — плюс dev-логин `admin`/`admin`

**Симптом**: вход не проходит. **Расследование показало, что бэкенд здоров**: `POST /api/auth/sign-in/email` напрямую → 200 + `set-cookie`, через Vite-прокси → 200, полный путь в браузере (форма → клик) → 200 → редирект на `/create` с загруженной сессией. Google OAuth сконфигурирован и отдаёт валидный redirect на `accounts.google.com`.

**Корень**: Chrome автозаполнял поле почты сохранённым значением **`admin`** (без домена). Dev-админ — это `admin@dev.local` / `"admin"` (`modules/auth/dev-admin.ts`, `DEV_ADMIN_EMAIL` никогда не был другим — проверено по истории). Голый `admin` резался zod'ом **на клиенте**, запрос вообще не уходил: пользователь видел только «введите корректный email» и делал вывод, что вход сломан. Подтверждено: `{"email":"admin"}` → `INVALID_EMAIL`, `{"email":"admin@dev.local"}` → 200.

**Сделано**:
- `apps/web/.../AuthForm.tsx` — `loginSchema.email` стал `z.string().transform(expandDevUsername).pipe(z.email(...))`. В **dev** значение без `@` разворачивается в `<ввод>@dev.local`, так что `admin`/`admin` реально логинит. Гейт `import.meta.env.DEV` — в проде ветка мертва, голый username остаётся невалидным. transform-then-pipe (а не refine) потому, что развернуть надо ДО проверки email, а `zodResolver` отдаёт в `onSubmit` уже трансформированное значение.
- `apps/api/scripts/set-password.ts` — новый dev-скрипт смены пароля: флоу сброса в приложении **нет** (нет почтовой инфраструктуры), поэтому забытый пароль иначе не восстановить. Хеширует хешером самого better-auth (`auth.$context.password.hash`) — любой другой даёт креденшл, который никогда не залогинится.
- БД: удалён тестовый `probe1@example.com` (аккаунт + 4 сессии + 1 транзакция); пароль `arturfeniks88@gmail.com` сброшен на `admin` (баланс 4540 не тронут).

**Тесты вперёд (RED→GREEN)**: `AuthForm.test.tsx` — 3 кейса: dev разворачивает `admin` → `admin@dev.local`; настоящий email не трогается; под `vi.stubEnv('DEV', false)` прод по-прежнему отвергает голый username. Ровно 1 упал до фикса. Гейт: API **575/575**, web **659/659**, tsc и ESLint чисто. Живая проверка: `admin`/`admin` в браузере → 200 → `/create` под Dev Admin с 1 млрд кредитов.

## [2026-07-29] feat | Скрытая страница /compare — Qwen Image Max vs Nano Banana Pro vs FLUX dev

**Зачем**: сравнить кандидата Qwen Image Max (DeepInfra) с текущими образ-моделями каталога на одном промпте, с честными метриками (время ожидания, цена).

**Сделано** (по плану `docs/superpowers/plans/2026-07-29-compare-generators.md`, с поправками на реальность):
- **Контракт DeepInfra проверен живьём** (метаданные модели): вход `{ prompt, size "W*H" }`, выход `{ images: [data-URL png], inference_status.cost }`, 7.5¢/картинка. Формы из плана (`resolution`/`aspect_ratio` → `image_url`) не существуют — реализовано по фактической схеме.
- **3 панели вместо 2**: Nano Banana Pro уже есть в каталоге (`nano-banana-pro`, Runware) — он и `flux-dev` идут через боевой `POST /api/generations` (кредиты, полный продакшен-путь); Qwen — через новый `POST /api/compare/generate` (синхронный прокси, минуя леджер: токен — серверный секрет, в браузер не отдаётся).
- API: `integrations/deepinfra/deepinfra-image.ts` (санитизированные ошибки в стиле DeepinfraError, таймаут 120с), `modules/compare/routes.ts` (requireUser, 10/мин), контракты `packages/contracts/src/compare.ts`.
- Web: модуль `modules/Compare` (zustand-стор с параллельным фан-аутом, гардом от гонок через AbortSignal и независимым retry на панель; логика — plain async-экшены стора, НЕ хук-в-сторе из плана — тот паттерн невалиден в React), `CompareForm` + `GenerationPanel` (4 состояния UI), роут `_shell.compare.tsx` (скрыт из навигации, секундомер тикает и при retry, unmount абортит in-flight запросы).

**Тесты вперёд**: contracts 7, API 12 (клиент + HTTP-границы: 401/400/502/успех/леджер не тронут), web 19 (стор: параллельность, независимый фейл, retry одной панели, «протухший ран не перетирает reset»; форма и панель по состояниям). Гейт: contracts **100/100**, API **587/587**, web **678/678**, tsc и ESLint чисто, build зелёный (чанк `_shell.compare` в бандле).

## [2026-07-31] feat | Style Studio — пользовательские стили как единый реестр

**Что**: стиль стал сущностью-конструктором (ADR style-studio, accepted): builtin-стили остались кодом (сид-каталог), пользовательские — таблица `style` (kind+config_json — задел под LoRA/reference без миграций); сервер резолвит styleId в момент генерации ДО списания, как модель по каталогу. `applyPromptPreset` принимает фрагменты параметром; wire `styleId` открыт enum→строка (все старые значения валидны). Страница «Стили»: библиотека (builtin-бейджи + свои с превью), конструктор (имя · EN-фрагмент со sparkle · негатив · рекомендуемая модель · превью за 1 кр через обычный charge-путь). Все пикеры стиля (Cinema shot/film/storyboard) читают реестр — свой стиль виден везде.

**Гейт**: contracts 146 · api 805 · web 870 · tsc/eslint чисто. Инвариант «builtin побайтово как раньше» запинен литеральными строками (red-green доказан агентом). Живая приёмка: «Неоновый нуар» создан → превью 1 кр → генерация по uuid стиля: composedPrompt начинается с фрагмента, кадр — минифигурка-детектив под неоновым фонарём в дожде. Попутно закрыт вечный i18n-пропуск builtin-стиля `comic` (рендерился сырым ключом).

**Коммиты**: d02dc78 · 2112045 · c1105c1 (бэк) · 681698a · dbb6af1 · 0973dc3 (веб).

## [2026-07-31] feat | Style Studio: стиль-пакет — промпт И референсы (бэкенд)

**Что**: поправка A1–A4 к ADR style-studio — стиль несёт ОБА полюса образа сразу: фрагменты и до 3 референс-картинок. `kind` остался `'prompt'` (референсы — возможность существующего конструктора, не новый вид), поэтому все styleId, уже лежащие в фильмах, шотах и шаблонах, валидны. Колонка `style.reference_images_json` (`[{id,path}]`, зеркало `shot.reference_images_json`, pragma-гардед micro-migration рядом с шотовыми); на wire читается как `{id,url}` — путь, никогда не байты. `POST /api/styles/:id/references` (201, cap 3) · `DELETE …/references/:refId` (200; неизвестный refId — no-op, файл остаётся безвредным сиротой — прецедент шотов).

**Доставка — существующий канал**: `resolveStyleFragments` → `resolveStyle`, отвечает всем пакетом `{fragment, negative, referenceImagePaths}` одним owner-scoped запросом (builtin → пустой список: код не хранит файлов). `generations.create()` читает пути в тот же серверный `referenceImages`-канал, что и фото сущностей, шот-рефы и chain-ребро канваса — **последними**, потому что стиль амбиентен.

**Главный инвариант**: амбиентный стиль НЕ имеет права сломать запрос, который сработал бы без него. Модель без `referenceMode` — рефы молча дропаются, фрагменты применяются всегда (прецедент владельца 2026-07-24). Счётный гейт (тот, что кидает 400) стилевых рефов НЕ ВИДИТ: остаток бюджета считается отдельно и переполнение ТРИММИТСЯ — иначе третья картинка в стиле начала бы ронять kontext-генерации с тегнутым персонажем, и связать это с давно отредактированным стилем было бы невозможно. Пропавший файл на диске дропает один реф с warn-строкой `style.reference.missing`, платный запрос продолжается.

**Гейт**: contracts 150 · api 818 · web tsc чисто (builtin-строки в `presetOptions` получили `referenceImages: []`). Мутационная проверка: снял гейт `model.referenceMode` — тест «молча дропает» покраснел, вернул — зелёный. Пины «builtin компонуется побайтово как раньше» не тронуты.

**Коммиты**: cb77f86 (contracts) · 74f6cf7 (styles: колонка, add/removeReference, resolveStyle, маршруты) · ead6291 (generations: слияние в канал + трим).

## [2026-07-31] feat | Style Studio: стиль-пакет — веб-половина и живая приёмка

**Веб**: конструктор получил блок «Референсы стиля» (клик/драг/вставка через shared `readImageFile`, тумбы с ✕, счётчик N/3 из `STYLE_MAX_REFERENCES`; только в режиме редактирования — рефы висят на строке стиля). На капе 3/3 плитка добавления **disabled с амбер-пояснением**, не скрыта (прецеденты в репо расходятся: канон шот-рефов размонтирует плитку, PartsStage дизейблит с причиной — выбран второй, зафиксировано в сайдкаре); отказ на капе продублирован в `acceptFile`, так что drop/paste мимо disabled-атрибута не проходит (тест: файл на 3/3 → ни одного запроса). Библиотека показывает «N реф.» янтарём возле фрагмента-тизера — пакет читается со шкафа. Копирайт честный: «применяются там, где модель их понимает» — фраза запинена тестом, чтобы правка текста не превратила её в обещание.

**Живая приёмка (владелец канала — team-lead)**: реф прикреплён к «Неоновому нуару» (201, файл с `/media`); генерация «a taxi waiting at a crosswalk» на flux-kontext-pro (8 кр) вернула **ту же улицу, что на референсе** — вывески «NEVTCH»/«NI-T-R», тот же фонарь, минифигурку заменило такси по промпту: референс реально управлял композицией. Тот же промпт на flux-schnell (1 кр) — успех, другая улица, чистый текстовый нуар: молчаливый дроп подтверждён на живом провайдере. Списания/сеттл честные в логе API.

**Найдено приёмкой и закрыто**: (1) редактор, оставаясь смонтированным, показывал текст ПЕРВОГО стиля при открытии второго — теперь keyed по id редактирования, регрессионный тест (жил в проде несколько часов, de5ce6b); (2) модалка редактора выше ~728px-вьюпорта не скроллилась — низ («Сохранить»/превью) был недостижим мышью; починено по канону a50f5a7: тело формы — скроллер `min-h-0 + overflow-y-auto`, действия — pinned `shrink-0`-футер (e6c16e4). Правило записано в design.md §6: **панель даёт кап высоты, скроллер — забота вызывающего, высокая форма пришпиливает действия**. Аудит показал ещё ~7 модалок этого класса риска (худшая — RunBranchDialog: гейтит списание) — уходят follow-up-задачей.

**Гейт**: web 884 · api 818 · contracts 150, tsc/eslint чисто, build зелёный.

**Коммиты**: de5ce6b (блок рефов + keying-фикс) · 6534492 (индикатор в библиотеке, disabled-на-капе) · e6c16e4 (скроллер модалки).

## [2026-07-31] fix | Два класса багов закрыты по всему приложению: скролл модалок и «редактор открывается протухшим»

**Класс 1 — недостижимый низ модалки.** Кит-Modal — flex-колонка с капом `max-h-[92dvh]`; flex-ребёнок с дефолтным `min-height:auto` переполняет панель, колесо крутит СТРАНИЦУ за оверлеем, и нижние кнопки недостижимы на невысоких вьюпортах (~728px). Третье появление (TemplateDetailModal a50f5a7 → StyleEditor e6c16e4) → полный аудит всех 21 модалки. Починены 5 (`bed840e`): RunBranchDialog (первым — гейтит СПИСАНИЕ, длинная ветка выталкивала confirm; тест строит план из 24 шагов), SoulEditModal, EntityEditor, CreateAssetModal (ошибка сервера прятала Submit ровно когда просила повторить), GenerationDetail. Двое не тронуты с вердиктом «ничего не растёт с данными» (StoryboardModal, FilmSettingsModal). Правило в design.md §6: **панель даёт кап, скроллер — забота вызывающего; форма с действиями пришпиливает их `shrink-0`-футером, read-mostly лист скроллит CTA вместе с телом**.

**Класс 2 — mounted-while-closed редактор сеет useState из props при первом маунте и не пересеивается.** Три экземпляра: StyleLibrary (второй стиль открывался с текстом первого, de5ce6b), EntityLibrary (редактор сущности открывался ПУСТЫМ — «Готово» стёрло бы имя и описание: порча данных) и CinemaEditorHeader (настройки фильма держали заголовок с загрузки — сохранение стиля из них откатило бы инлайн-переименование; сосед по бару FilmTitleField сам же и мутирует этот film). Фиксы: `key={editing?.id ?? 'new'}` для редакторов сущностей/стилей, mount-guard для настроек фильма (id фильма не меняется — протухает содержимое). `6d1b19f` + тест-пины (`b3f15f6` — harness с мутируемым film, red-green: со снятым guard'ом ассерт ловит сам откат переименования). Пять модалок проверены и чисты (SoulEditModal, ShotInspector, StyleEditor, CreateAssetModal, GenerationDetail) — класс закрыт по приложению.

**Оба класса найдены живой приёмкой** пакета стиля, не жалобой пользователя. Гейт: web 892 · api 818, tsc/eslint чисто. Коммиты: bed840e · 6d1b19f · b3f15f6.

## [2026-07-31] feat | Создание фильма: только название + обложка; стиль и аспект — на детальной

**Что** (веление владельца: «нужно только название и обложка по желанию»): диалог «Новый фильм» худеет до поля «Название» и опциональной обложки (клик/драг/вставка, превью с удалением до сабмита); пиллы соотношения сторон и селект стиля из create-режима убраны — обе ручки остаются в «Настройках фильма» на детальной странице (edit-режим не тронут, запинено тестом «edit всё ещё предлагает оба»). Карточка фильма в библиотеке впервые показывает обложку (`object-cover` в медиа-плите; плейсхолдер при null).

**Wire** (расширяющее): `Film.coverUrl: string|null` в списке и детали; `POST /api/films` принимает `{title}` — `aspectRatio` optional (сервер дефолтит `16:9`, `DEFAULT_FILM_ASPECT_RATIO` — одна константа на оба пути создания, включая шаблонный), `coverDataUri` — опциональный raster data URI под ОБЩИМ правилом рефов (`rasterImageDataUriSchema` вынесен в contracts и разделён с шот-рефами; третья копия в style.ts помечена follow-up'ом, не тронута — не инвертировать зависимость). Невалидная обложка → 400 и фильм НЕ создаётся (нет осиротевших фильмов). Клиент при создании НЕ шлёт aspectRatio вовсе — дефолтом владеет ровно одна сторона. Колонка `cover_image_path` pragma-гардед микро-миграцией; удаление фильма файл обложки не трогает (прецедент рефов).

**Живая приёмка**: создан «Кот в нуаре» одним именем + обложка (кадр из вчерашнего стилевого клипа) — карточка в библиотеке с кошкой, бейдж 16:9 от серверного дефолта, у соседнего фильма плейсхолдер как был. PATCH-обложки нет (скоуп create-only, владельцу предложен follow-up «добавить обложку позже» в настройках).

**Гейт**: contracts 161 · api 828 · web 900, tsc/eslint чисто. Коммиты: c8d92e6 · cfce5fc · a2ca8d2 (бэк) · df301a9 (веб).

## [2026-08-02] feat | Обложка фильма редактируется в настройках (follow-up)

**Что** (одобренный follow-up): блок «Обложка (по желанию)» появился в edit-режиме «Настроек фильма» — текущая тумба при наличии, замена клик/драг/вставкой, ✕ убрать. Разметка блока ОБЩАЯ с create-режимом (одна wire-маппинг функция вместо двух копий, которые могли бы разъехаться ровно на опасном правиле).

**Wire** (расширяющее): `PATCH /api/films/:id` — `coverDataUri` трёхзначный: data URI = заменить · `null` = убрать · ключ отсутствует = не трогать. Форма ОПУСКАЕТ ключ, если картинку не трогали. Невалидная картинка → 400 и строка не меняется ЦЕЛИКОМ (включая title из того же body). Старый файл обложки при замене/очистке остаётся сиротой (прецедент рефов; свипа по-прежнему нет).

**Ловушка партиала** — «переименовал фильм, обложка молча стёрлась» — запинена трижды: мутация контракта (`.default(null)` красит тест), мутация сервиса (`!== undefined` → `if(true)` красит «KEEPS the cover»), и инъекция бага на фронте (untouched → `{coverDataUri:null}` — тест печатает утечку в ассерте). Живая приёмка: обложка добавлена «Проверке композера» через настройки → карточка с обложкой; переименование через форму И title-only PATCH через API — обложка выжила в обоих.

**Гейт**: contracts 166 · api 835 · web 908, tsc/eslint чисто. Коммиты: d92f060 · ff4fe10 (бэк) · 401c4d1 (веб).

## [2026-08-02] docs | Инфраструктура: спека деплоя на Railway (репозиторий, R2, CI/CD) — до кода

**Зачем**: владелец решил поднять прод и попросил сначала спеку, потом исполнение. Написаны два документа: ADR [[railway-deployment]] (решения + отвергнутые варианты) и [[infrastructure-railway]] (исполнительная спека: диаграммы, матрица env, `railway.json`, дизайн R2-шва, риски с критериями приёмки, CI/CD, 7 фаз). Решения владельца зафиксированы: Railway · приватный `AzamatRaimbekov/opencreate` · R2 сразу (не том) · деплой из GitHub Actions по токену (не авто-деплой платформы).

**Что выяснено по коду, а не предположено** (это и есть ценность спеки):

1. **SQLite диктует конфиг платформы, а не наоборот.** Дефолт Railway — перекрывающийся деплой: новый инстанс стартует до остановки старого. На одном томе это два процесса на одном файле БД. `overlap = 0` + `replicas = 1` — не настройка производительности, а инвариант корректности; ценой стали секунды даунтайма на деплой.
2. **`/media/*` уже публичен по дизайну** (`app.ts:543-550`: непредсказуемые UUID-ключи, `<img>`/`<video>` не умеют слать заголовки авторизации). Значит 302 на публичный домен R2 **ничего не ослабляет** — модель «ключ = капабилити» та же. Это снимает главное возражение против R2 и записано явно, чтобы не переспрашивать.
3. **Цена перехода на R2 — ровно два члена интерфейса.** `dir` (уходит в `@fastify/static`) и `localPath` (уходит в ffmpeg) — файловые понятия, которых в объектном хранилище нет. Пять вызовов: `films/service.ts:670,749,831` и `models3d/service.ts:160,161`. Замена: `serve` · `materialize`/`release` · `scratchPath`/`publishLocalFile`. Публичный контракт `/media/<key>.<ext>` НЕ меняется → **миграции строк БД нет** (в базе лежат именно эти пути — `mediaJson`, `coverImagePath`, `conceptImagePath`, шот-рефы). Продовых данных ещё нет, так что и переливки файлов нет.
4. **`TRUST_PROXY` на Railway ломается в обе стороны.** `parseTrustProxy` умеет `true|false|string`, но НЕ число, а fastify/proxy-addr принимает счётчик хопов. `true` доверяет ЛЕВОМУ значению `X-Forwarded-For` — безопасно только если край перезаписывает заголовок; если дописывает, атакующий выбирает себе новый бакет рейт-лимита на каждый запрос. Не выставить вовсе — обратная беда: все пользователи в одном бакете, 10 auth-запросов/мин запирают вход всем (сценарий из PROD.md). Итог: одна правка парсера (числовой хоп) + живая проверка как критерий приёмки.
5. **Том против non-root пользователя** — риск R1: образ бежит под `node` (uid 1000), `createDb` пишет в `/app/data` на старте; том, смонтированный root'ом, убивает процесс на `EACCES` ещё до health-чека. Порядок разрешения записан с откатами (entrypoint с chown → и лишь в крайнем случае root, явно, а не молча).
6. **ffmpeg в образе — проверено, а не предположено**: postinstall `ffmpeg-static` разрешён в `pnpm-workspace.yaml` (`allowBuilds`), стадия `prod-deps` ставит его под linux → в рантайме реальный бинарь без `apt`. Но именно R2 добавляет рендеру сетевые входы — поэтому «рендер отдал играбельный mp4 в проде» вынесен в критерий приёмки.

**Аудит перед публикацией**: `.env` никогда не коммитился, блобов >1 МБ в истории нет, `.git` = 21 МБ, 1639 файлов — репозиторий чист для приватной публикации как есть.

**Статус**: ADR в состоянии *proposed*, реализация не начата — ждёт одобрения владельца по гейту project-kickoff. Файлов кода не тронуто.

## 2026-08-02 — Seedance 2.0 переведён на Segmind

**ADR**: [segmind-seedance-channel](./decisions/segmind-seedance-channel.md) · статус accepted

Целый день ушёл на вопрос «какой канал Seedance дешевле», и почти все промежуточные
ответы были неверными. Ценность здесь не в итоговом провайдере, а в том, ЧЕМ его
удалось наконец измерить.

**Найден инструмент сравнения.** Формула токенов `ширина × высота × длительность ×
24 / 1024` (опубликована OpenRouter) проверена на двух реальных счетах: DeepInfra —
расхождение 0.28%, Segmind — 0.33%. Одни провайдеры считают по секундам, другие по
токенам; только ставка за миллион приводит их к общей шкале. Побочный эффект: цену
любого разрешения теперь считаем заранее, не тратя денег — прогноз для 15с/1080p был
$5.10, списали $5.12.

**Ловушка двух колонок сработала на всех пяти каналах.** `with video input` дешевле за
секунду, но считается по вход+выход; мы всегда на дорогой строке `no video`. Все
сравнительные обзоры цитируют дешёвую и приходят к обратному выводу. Тот же капкан у
DeepInfra ($4.3 против $7/M), kie.ai, BytePlus, fal, Atlas Cloud.

**Прайс расходится со счётом — и это проверяемо только замером.** DeepInfra обещает
$7.00/M, списывает измеренные $7.70/M (+10%). Segmind обещает $7.00/M и списывает
$7.02/M. Это и стало решающим аргументом, а не 9% экономии.

**Итог**: `seedance-2-0` → Segmind, цепочка failover segmind → deepinfra → bytedance.
$5.12 против $5.61, то есть $49 на сотне роликов.

**Побочно найдено и починено**: у DeepInfra рендеры длиннее 5 минут молча сгорали —
undici применяет свой `headersTimeout` 300с раньше, чем `AbortSignal.timeout(10 мин)`.
Замерено: падение на 305.1с с бесполезным `TypeError`. Диспетчер с выключенными
таймерами + сохранение `cause.code` в сообщении.

**Отвергнуто**: Volcano Engine (материк) — дешевле на 2.6%, но регистрация требует
номер +86; ofox.ai — равен по цене, но любая неизвестная им комбинация параметров
стоит $1.70/с вместо $0.34; BytePlus напрямую — та же цена плюс невозвратный пакет
$29.40; Higgsfield — $6.34 за ролик, это платформа с пресетами, а не API.

**Не закрыто**: хост, с которого Segmind отдаёт mp4, неизвестен и не в SSRF-аллоулисте.
Страницам сравнения не мешает, продовой генерации — блокер. Вскроется первым прогоном.

**Инструменты**: две скрытые операторские страницы. `/compare-video` — гонка каналов на
одном промпте с чеками провайдеров. `/verify` — один канал, фиксированные 15с/1080p и
СЫРОЙ конверт ответа на экране (на канале с неизвестной формой это единственное, что
отличает «файла нет» от «файл под непрочитанным ключом» — иначе каждая догадка стоит $5).
