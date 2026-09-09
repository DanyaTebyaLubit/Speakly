// Короткие уроки: проверенные задания с заданной лексемой и объяснением.
const Courses = [
  {
    "id": "be",
    "title": "Be: am, is, are",
    "rule": "В настоящем времени: I am; he/she/it is; you/we/they are. В вопросе be ставится перед подлежащим.",
    "example": "I am ready. — Я готов.",
    "questions": [
      {
        "id": "course:be:0",
        "prompt": "I ___ ready.",
        "answer": "am",
        "translation": "Я готов.",
        "explanation": "С I в настоящем времени используется am.",
        "hint": "Используйте am в нужной форме.",
        "word": "I am ready."
      },
      {
        "id": "course:be:1",
        "prompt": "She ___ at home.",
        "answer": "is",
        "translation": "Она дома.",
        "explanation": "С she используется is.",
        "hint": "Используйте is в нужной форме.",
        "word": "She is at home."
      },
      {
        "id": "course:be:2",
        "prompt": "They ___ tired.",
        "answer": "are",
        "translation": "Они устали.",
        "explanation": "С they используется are.",
        "hint": "Используйте are в нужной форме.",
        "word": "They are tired."
      },
      {
        "id": "course:be:3",
        "prompt": "___ you busy?",
        "answer": "Are",
        "translation": "Ты занят?",
        "explanation": "Вопрос начинается с Are перед you.",
        "hint": "Используйте Are в нужной форме.",
        "word": "Are you busy?"
      },
      {
        "id": "course:be:4",
        "prompt": "He ___ not here.",
        "answer": "is",
        "translation": "Его здесь нет.",
        "explanation": "Отрицание: he is not. Не пропускайте is.",
        "hint": "Используйте is в нужной форме.",
        "word": "He is not here."
      }
    ]
  },
  {
    "id": "present",
    "title": "Present Simple: привычки",
    "rule": "Для привычек используйте Present Simple. С he/she/it добавляйте -s; в вопросах и отрицаниях после does глагол без -s.",
    "example": "She works here. — Она работает здесь.",
    "questions": [
      {
        "id": "course:present:0",
        "prompt": "She ___ here every day.",
        "answer": "works",
        "translation": "Она работает здесь каждый день.",
        "explanation": "С she в утверждении work получает -s.",
        "hint": "Используйте work в нужной форме.",
        "word": "She works here every day."
      },
      {
        "id": "course:present:1",
        "prompt": "I ___ here every day.",
        "answer": "work",
        "translation": "Я работаю здесь каждый день.",
        "explanation": "С I нужна начальная форма work.",
        "hint": "Используйте work в нужной форме.",
        "word": "I work here every day."
      },
      {
        "id": "course:present:2",
        "prompt": "___ he work here?",
        "answer": "Does",
        "translation": "Он работает здесь?",
        "explanation": "Для he вопрос строится с Does.",
        "hint": "Используйте Does в нужной форме.",
        "word": "Does he work here?"
      },
      {
        "id": "course:present:3",
        "prompt": "He does not ___ here.",
        "answer": "work",
        "translation": "Он здесь не работает.",
        "explanation": "После does not глагол без окончания -s.",
        "hint": "Используйте work в нужной форме.",
        "word": "He does not work here."
      },
      {
        "id": "course:present:4",
        "prompt": "___ they work here?",
        "answer": "Do",
        "translation": "Они здесь работают?",
        "explanation": "С they используйте Do, а не Does.",
        "hint": "Используйте Do в нужной форме.",
        "word": "Do they work here?"
      }
    ]
  },
  {
    "id": "past",
    "title": "Past Simple: вопросы с did",
    "rule": "После did и did not используется начальная форма глагола. Сам did уже показывает прошедшее время.",
    "example": "Did you go home? — Ты пошёл домой?",
    "questions": [
      {
        "id": "course:past:0",
        "prompt": "Did you ___ home?",
        "answer": "go",
        "translation": "Ты пошёл домой?",
        "explanation": "После did: go, а не went.",
        "hint": "Используйте go в нужной форме.",
        "word": "Did you go home?"
      },
      {
        "id": "course:past:1",
        "prompt": "She did not ___ him.",
        "answer": "see",
        "translation": "Она его не видела.",
        "explanation": "После did not: see, а не saw.",
        "hint": "Используйте see в нужной форме.",
        "word": "She did not see him."
      },
      {
        "id": "course:past:2",
        "prompt": "___ he call yesterday?",
        "answer": "Did",
        "translation": "Он звонил вчера?",
        "explanation": "Вопрос о прошлом начинается с Did.",
        "hint": "Используйте Did в нужной форме.",
        "word": "Did he call yesterday?"
      },
      {
        "id": "course:past:3",
        "prompt": "We did not ___ it.",
        "answer": "do",
        "translation": "Мы этого не сделали.",
        "explanation": "Did not уже показывает прошлое; дальше do.",
        "hint": "Используйте do в нужной форме.",
        "word": "We did not do it."
      },
      {
        "id": "course:past:4",
        "prompt": "Did she ___ the book?",
        "answer": "read",
        "translation": "Она прочитала книгу?",
        "explanation": "После did используется начальная форма read.",
        "hint": "Используйте read в нужной форме.",
        "word": "Did she read the book?"
      }
    ]
  },
  {
    "id": "continuous",
    "title": "Present Continuous: сейчас",
    "rule": "Для действия прямо сейчас: am/is/are + глагол с -ing. Не пропускайте форму be.",
    "example": "She is reading now. — Она сейчас читает.",
    "questions": [
      {
        "id": "course:continuous:0",
        "prompt": "I ___ working now.",
        "answer": "am",
        "translation": "Я сейчас работаю.",
        "explanation": "С I используется am.",
        "hint": "Используйте am в нужной форме.",
        "word": "I am working now."
      },
      {
        "id": "course:continuous:1",
        "prompt": "She is ___ now.",
        "answer": "reading",
        "translation": "Она сейчас читает.",
        "explanation": "После is для процесса нужна форма reading.",
        "hint": "Используйте read в нужной форме.",
        "word": "She is reading now."
      },
      {
        "id": "course:continuous:2",
        "prompt": "They ___ playing now.",
        "answer": "are",
        "translation": "Они сейчас играют.",
        "explanation": "С they используется are.",
        "hint": "Используйте are в нужной форме.",
        "word": "They are playing now."
      },
      {
        "id": "course:continuous:3",
        "prompt": "___ he sleeping now?",
        "answer": "Is",
        "translation": "Он сейчас спит?",
        "explanation": "В вопросе Is ставится перед he.",
        "hint": "Используйте Is в нужной форме.",
        "word": "Is he sleeping now?"
      },
      {
        "id": "course:continuous:4",
        "prompt": "We are ___ for you now.",
        "answer": "waiting",
        "translation": "Мы сейчас ждём тебя.",
        "explanation": "Процесс: are waiting, а не are wait.",
        "hint": "Используйте wait в нужной форме.",
        "word": "We are waiting for you now."
      }
    ]
  },
  {
    "id": "perfect",
    "title": "Present Perfect: результат",
    "rule": "Have/has + третья форма глагола. С he/she/it — has. Yet в отрицании часто стоит в конце.",
    "example": "I have already finished. — Я уже закончил.",
    "questions": [
      {
        "id": "course:perfect:0",
        "prompt": "She ___ already finished.",
        "answer": "has",
        "translation": "Она уже закончила.",
        "explanation": "С she используйте has.",
        "hint": "Используйте has в нужной форме.",
        "word": "She has already finished."
      },
      {
        "id": "course:perfect:1",
        "prompt": "They ___ already arrived.",
        "answer": "have",
        "translation": "Они уже приехали.",
        "explanation": "С they используйте have.",
        "hint": "Используйте have в нужной форме.",
        "word": "They have already arrived."
      },
      {
        "id": "course:perfect:2",
        "prompt": "Have you ___ it?",
        "answer": "seen",
        "translation": "Ты это видел?",
        "explanation": "Третья форма see — seen.",
        "hint": "Используйте see в нужной форме.",
        "word": "Have you seen it?"
      },
      {
        "id": "course:perfect:3",
        "prompt": "I have not finished ___.",
        "answer": "yet",
        "translation": "Я ещё не закончил.",
        "explanation": "Yet в отрицании означает «ещё».",
        "hint": "Используйте yet в нужной форме.",
        "word": "I have not finished yet."
      },
      {
        "id": "course:perfect:4",
        "prompt": "He has ___ home.",
        "answer": "gone",
        "translation": "Он ушёл домой.",
        "explanation": "Третья форма go — gone.",
        "hint": "Используйте go в нужной форме.",
        "word": "He has gone home."
      }
    ]
  },
  {
    "id": "modals",
    "title": "Модальные глаголы",
    "rule": "После can, should и must используйте глагол без to. Вопрос с can начинается с Can.",
    "example": "You should rest. — Тебе стоит отдохнуть.",
    "questions": [
      {
        "id": "course:modals:0",
        "prompt": "She can ___ English.",
        "answer": "speak",
        "translation": "Она умеет говорить по-английски.",
        "explanation": "После can — speak, без -s и без to.",
        "hint": "Используйте speak в нужной форме.",
        "word": "She can speak English."
      },
      {
        "id": "course:modals:1",
        "prompt": "You should ___ now.",
        "answer": "rest",
        "translation": "Тебе стоит сейчас отдохнуть.",
        "explanation": "После should — начальная форма rest.",
        "hint": "Используйте rest в нужной форме.",
        "word": "You should rest now."
      },
      {
        "id": "course:modals:2",
        "prompt": "___ you help me?",
        "answer": "Can",
        "translation": "Можешь мне помочь?",
        "explanation": "Can перед you образует вопрос о возможности.",
        "hint": "Используйте Can в нужной форме.",
        "word": "Can you help me?"
      },
      {
        "id": "course:modals:3",
        "prompt": "We must ___ now.",
        "answer": "go",
        "translation": "Мы должны сейчас идти.",
        "explanation": "После must — go, без to.",
        "hint": "Используйте go в нужной форме.",
        "word": "We must go now."
      },
      {
        "id": "course:modals:4",
        "prompt": "He cannot ___ today.",
        "answer": "come",
        "translation": "Он не может прийти сегодня.",
        "explanation": "После cannot — начальная форма come.",
        "hint": "Используйте come в нужной форме.",
        "word": "He cannot come today."
      }
    ]
  }
];
