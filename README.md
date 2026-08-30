# trademanager-open-source
![screen1](https://github.com/pinkest-dev/trademanager-open-source/assets/70286254/c81ddb29-dc20-4388-b6c2-139487c65e80)![screen3](https://github.com/pinkest-dev/trademanager-open-source/assets/70286254/9f18e27b-b5ce-4715-a503-d952c7fd7161)
![screen2](https://github.com/pinkest-dev/trademanager-open-source/assets/70286254/ab84c95c-12ec-4c0b-bdab-db4097f7d65c)




РУКОВОДСТВО ПО ИСПОЛЬЗОВАНИЮ ТУТ - https://telegra.ph/Otkrytyj-manual-po-Trade-Manager-06-30<br/>
Скачать последнюю версию: https://github.com/rawr111/trademanager-open-source/releases/latest

Как собрать проект:
1. Клонируем репозиторий к себе на компьютер (git clone https://github.com/rawr111/trademanager-open-source)
2. Устанавливаем бибилотеки (npm install)
3. npm start - для запуска в режиме разработчика
4. npm run make - для компиляции

Внешние модули (puppeteer, sharp, chromium, steamcommunity и т.д.) forge теперь
кладёт в сборку сам, вручную копировать их в resources больше не нужно. Список
модулей — в `webpack/externals.js`, копирование — в хуке `packageAfterPrune`
(`forge.config.js`).

Если сборка падает на node-gyp с `No module named 'distutils'`, значит node-gyp
запустился на Python 3.12+, где distutils удалён. Соберите с Python 3.11:

    PYTHON=/путь/до/python3.11 npm run make

либо поставьте setuptools в активный Python.
