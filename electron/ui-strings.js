// Text of the native dialogs the main process shows (exit timeout, renderer
// crash, folder picker, launch error). The renderer reports the active UI
// language over 'app-set-ui-language'; before it does (or when it cannot,
// e.g. a launch error) the OS language is used when it is one of ours.
const UI_LANGUAGES = ['en', 'de', 'es', 'fr', 'pl', 'pt-BR', 'ru'];

const STRINGS = {
    en: {
        closeTitle: 'Game is not responding',
        closeMessage: 'The game has not acknowledged your exit request.',
        closeDetail: 'You can keep playing or close without saving your latest progress.',
        keepOpen: 'Keep open',
        closeWithoutSaving: 'Close without saving',
        crashTitle: 'The game stopped unexpectedly',
        crashMessage: 'The game stopped unexpectedly.',
        crashDetail: 'Your saved games are safe; progress since the last save may be lost. Reload to continue from the main menu. Details are written to the logs folder.',
        reload: 'Reload',
        quit: 'Quit',
        modFolderTitle: 'Choose community database folder',
        launchErrorTitle: 'Launch error',
        launchErrorMessage: 'Failed to start the game:',
    },
    de: {
        closeTitle: 'Das Spiel reagiert nicht',
        closeMessage: 'Das Spiel hat deine Anfrage zum Beenden nicht bestätigt.',
        closeDetail: 'Du kannst weiterspielen oder schließen, ohne deinen neuesten Fortschritt zu speichern.',
        keepOpen: 'Offen lassen',
        closeWithoutSaving: 'Ohne Speichern schließen',
        crashTitle: 'Das Spiel wurde unerwartet beendet',
        crashMessage: 'Das Spiel wurde unerwartet beendet.',
        crashDetail: 'Deine Spielstände sind sicher; Fortschritt seit dem letzten Speichern kann verloren sein. Lade neu, um im Hauptmenü weiterzumachen. Details stehen im Ordner „logs“.',
        reload: 'Neu laden',
        quit: 'Beenden',
        modFolderTitle: 'Ordner der Community-Datenbank wählen',
        launchErrorTitle: 'Startfehler',
        launchErrorMessage: 'Das Spiel konnte nicht gestartet werden:',
    },
    es: {
        closeTitle: 'El juego no responde',
        closeMessage: 'El juego no ha confirmado tu solicitud de salida.',
        closeDetail: 'Puedes seguir jugando o cerrar sin guardar tu progreso más reciente.',
        keepOpen: 'Mantener abierto',
        closeWithoutSaving: 'Cerrar sin guardar',
        crashTitle: 'El juego se detuvo inesperadamente',
        crashMessage: 'El juego se detuvo inesperadamente.',
        crashDetail: 'Tus partidas guardadas están a salvo; puede perderse el progreso desde el último guardado. Recarga para continuar desde el menú principal. Los detalles se guardan en la carpeta «logs».',
        reload: 'Recargar',
        quit: 'Salir',
        modFolderTitle: 'Elige la carpeta de la base de datos de la comunidad',
        launchErrorTitle: 'Error de inicio',
        launchErrorMessage: 'No se pudo iniciar el juego:',
    },
    fr: {
        closeTitle: 'Le jeu ne répond pas',
        closeMessage: "Le jeu n'a pas confirmé ta demande de fermeture.",
        closeDetail: 'Tu peux continuer à jouer ou fermer sans enregistrer ta progression la plus récente.',
        keepOpen: 'Laisser ouvert',
        closeWithoutSaving: 'Fermer sans enregistrer',
        crashTitle: "Le jeu s'est arrêté de façon inattendue",
        crashMessage: "Le jeu s'est arrêté de façon inattendue.",
        crashDetail: 'Tes sauvegardes sont intactes ; la progression depuis la dernière sauvegarde peut être perdue. Recharge pour reprendre depuis le menu principal. Les détails sont écrits dans le dossier « logs ».',
        reload: 'Recharger',
        quit: 'Quitter',
        modFolderTitle: 'Choisis le dossier de la base de données communautaire',
        launchErrorTitle: 'Erreur de lancement',
        launchErrorMessage: 'Impossible de lancer le jeu :',
    },
    pl: {
        closeTitle: 'Gra nie odpowiada',
        closeMessage: 'Gra nie potwierdziła prośby o zamknięcie.',
        closeDetail: 'Możesz grać dalej albo zamknąć grę bez zapisu najnowszych postępów.',
        keepOpen: 'Nie zamykaj',
        closeWithoutSaving: 'Zamknij bez zapisu',
        crashTitle: 'Gra nieoczekiwanie przestała działać',
        crashMessage: 'Gra nieoczekiwanie przestała działać.',
        crashDetail: 'Twoje zapisy są bezpieczne; postępy od ostatniego zapisu mogą przepaść. Wczytaj ponownie, aby kontynuować od menu głównego. Szczegóły trafiają do folderu „logs”.',
        reload: 'Wczytaj ponownie',
        quit: 'Wyjdź',
        modFolderTitle: 'Wybierz folder bazy danych społeczności',
        launchErrorTitle: 'Błąd uruchamiania',
        launchErrorMessage: 'Nie udało się uruchomić gry:',
    },
    'pt-BR': {
        closeTitle: 'O jogo não está respondendo',
        closeMessage: 'O jogo não confirmou seu pedido de saída.',
        closeDetail: 'Você pode continuar jogando ou fechar sem salvar seu progresso mais recente.',
        keepOpen: 'Manter aberto',
        closeWithoutSaving: 'Fechar sem salvar',
        crashTitle: 'O jogo parou inesperadamente',
        crashMessage: 'O jogo parou inesperadamente.',
        crashDetail: 'Seus saves estão seguros; o progresso desde o último save pode ser perdido. Recarregue para continuar a partir do menu principal. Os detalhes ficam na pasta "logs".',
        reload: 'Recarregar',
        quit: 'Sair',
        modFolderTitle: 'Escolha a pasta do banco de dados da comunidade',
        launchErrorTitle: 'Erro ao iniciar',
        launchErrorMessage: 'Não foi possível iniciar o jogo:',
    },
    ru: {
        closeTitle: 'Игра не отвечает',
        closeMessage: 'Игра не подтвердила запрос на выход.',
        closeDetail: 'Можно продолжить игру или закрыть её, не сохранив последний прогресс.',
        keepOpen: 'Не закрывать',
        closeWithoutSaving: 'Закрыть без сохранения',
        crashTitle: 'Игра неожиданно завершилась',
        crashMessage: 'Игра неожиданно завершилась.',
        crashDetail: 'Твои сохранения в безопасности; прогресс после последнего сохранения может быть потерян. Перезапусти, чтобы продолжить из главного меню. Подробности записаны в папку «logs».',
        reload: 'Перезапустить',
        quit: 'Выйти',
        modFolderTitle: 'Выбери папку базы данных сообщества',
        launchErrorTitle: 'Ошибка запуска',
        launchErrorMessage: 'Не удалось запустить игру:',
    },
};

/** One of ours for a language code ("de", "pt-BR", an OS locale like "de-AT" or "pt_BR"), else null. */
function pickUiLanguage(code) {
    if (typeof code !== 'string' || !code) return null;
    if (UI_LANGUAGES.includes(code)) return code;
    const [base] = code.replace('_', '-').split('-');
    const lower = (base || '').toLowerCase();
    if (lower === 'pt') return 'pt-BR'; // the only Portuguese we ship
    return UI_LANGUAGES.includes(lower) ? lower : null;
}

/** A native dialog string in `language`, English when the language or key is missing. */
function uiString(language, key) {
    const table = STRINGS[language] || STRINGS.en;
    return table[key] || STRINGS.en[key] || key;
}

module.exports = { UI_LANGUAGES, STRINGS, pickUiLanguage, uiString };
