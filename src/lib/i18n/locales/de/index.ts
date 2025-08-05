// German translations index
// Deutsche Übersetzungen

export default {
  common: {
    // Navigation
    navigation: {
      dashboard: 'Dashboard',
      projects: 'Projekte',
      designer: 'Designer',
      analytics: 'Analytik',
      settings: 'Einstellungen',
      help: 'Hilfe',
      profile: 'Profil',
      logout: 'Abmelden'
    },

    // Actions
    actions: {
      save: 'Speichern',
      cancel: 'Abbrechen',
      delete: 'Löschen',
      edit: 'Bearbeiten',
      create: 'Erstellen',
      update: 'Aktualisieren',
      confirm: 'Bestätigen',
      close: 'Schließen',
      open: 'Öffnen',
      back: 'Zurück',
      next: 'Weiter',
      previous: 'Vorherige',
      finish: 'Fertigstellen',
      submit: 'Absenden',
      reset: 'Zurücksetzen',
      clear: 'Leeren',
      search: 'Suchen',
      filter: 'Filtern',
      sort: 'Sortieren',
      export: 'Exportieren',
      import: 'Importieren',
      download: 'Herunterladen',
      upload: 'Hochladen',
      copy: 'Kopieren',
      paste: 'Einfügen',
      duplicate: 'Duplizieren',
      move: 'Verschieben',
      rename: 'Umbenennen',
      share: 'Teilen',
      preview: 'Vorschau',
      publish: 'Veröffentlichen',
      archive: 'Archivieren',
      restore: 'Wiederherstellen'
    },

    // Status
    status: {
      loading: 'Laden...',
      saving: 'Speichern...',
      saved: 'Gespeichert',
      error: 'Fehler',
      success: 'Erfolg',
      warning: 'Warnung',
      info: 'Info',
      draft: 'Entwurf',
      published: 'Veröffentlicht',
      archived: 'Archiviert',
      active: 'Aktiv',
      inactive: 'Inaktiv',
      pending: 'Ausstehend',
      completed: 'Abgeschlossen',
      failed: 'Fehlgeschlagen',
      cancelled: 'Abgebrochen'
    },

    // Time and dates
    time: {
      now: 'Jetzt',
      today: 'Heute',
      yesterday: 'Gestern',
      tomorrow: 'Morgen',
      thisWeek: 'Diese Woche',
      lastWeek: 'Letzte Woche',
      nextWeek: 'Nächste Woche',
      thisMonth: 'Diesen Monat',
      lastMonth: 'Letzten Monat',
      nextMonth: 'Nächsten Monat',
      thisYear: 'Dieses Jahr',
      lastYear: 'Letztes Jahr',
      nextYear: 'Nächstes Jahr',
      never: 'Niemals',
      always: 'Immer',
      minutes: 'Minuten',
      hours: 'Stunden',
      days: 'Tage',
      weeks: 'Wochen',
      months: 'Monate',
      years: 'Jahre'
    },

    // Form fields
    fields: {
      name: 'Name',
      title: 'Titel',
      description: 'Beschreibung',
      email: 'E-Mail',
      password: 'Passwort',
      confirmPassword: 'Passwort bestätigen',
      firstName: 'Vorname',
      lastName: 'Nachname',
      phone: 'Telefon',
      address: 'Adresse',
      city: 'Stadt',
      country: 'Land',
      zipCode: 'PLZ',
      website: 'Website',
      organization: 'Organisation',
      role: 'Rolle',
      department: 'Abteilung',
      notes: 'Notizen',
      tags: 'Tags',
      category: 'Kategorie',
      type: 'Typ',
      value: 'Wert',
      label: 'Label',
      placeholder: 'Platzhalter',
      required: 'Erforderlich',
      optional: 'Optional'
    },

    // Messages
    messages: {
      welcome: 'Willkommen bei QDesigner Modern',
      noData: 'Keine Daten verfügbar',
      noResults: 'Keine Ergebnisse gefunden',
      emptyState: 'Noch nichts hier',
      comingSoon: 'Bald verfügbar',
      underDevelopment: 'In Entwicklung',
      maintenance: 'Wartung',
      unauthorized: 'Unbefugter Zugriff',
      forbidden: 'Zugriff verweigert',
      notFound: 'Seite nicht gefunden',
      serverError: 'Serverfehler',
      networkError: 'Netzwerkfehler',
      timeout: 'Zeitüberschreitung',
      retry: 'Bitte erneut versuchen',
      contactSupport: 'Kontaktieren Sie den Support, wenn das Problem weiterhin besteht'
    },

    // Confirmations
    confirmations: {
      delete: 'Sind Sie sicher, dass Sie dieses Element löschen möchten?',
      deleteMultiple: 'Sind Sie sicher, dass Sie {{count}} Elemente löschen möchten?',
      unsavedChanges: 'Sie haben ungespeicherte Änderungen. Möchten Sie wirklich fortfahren?',
      permanentAction: 'Diese Aktion kann nicht rückgängig gemacht werden',
      confirmAction: 'Bitte bestätigen Sie diese Aktion',
      archiveItem: 'Sind Sie sicher, dass Sie dieses Element archivieren möchten?',
      restoreItem: 'Sind Sie sicher, dass Sie dieses Element wiederherstellen möchten?'
    },

    // File operations
    files: {
      upload: 'Datei hochladen',
      uploadMultiple: 'Dateien hochladen',
      selectFile: 'Datei auswählen',
      selectFiles: 'Dateien auswählen',
      dropFiles: 'Dateien hier ablegen',
      supportedFormats: 'Unterstützte Formate',
      maxSize: 'Maximale Größe',
      fileName: 'Dateiname',
      fileSize: 'Dateigröße',
      fileType: 'Dateityp',
      lastModified: 'Zuletzt geändert',
      processing: 'Verarbeitung...',
      uploadSuccess: 'Upload erfolgreich',
      uploadError: 'Upload fehlgeschlagen',
      invalidFormat: 'Ungültiges Dateiformat',
      fileTooLarge: 'Datei ist zu groß'
    }
  },

  questions: {
    types: {
      textInput: 'Texteingabe',
      textDisplay: 'Textanzeige',
      singleChoice: 'Einfachauswahl',
      multipleChoice: 'Mehrfachauswahl',
      scale: 'Skala',
      matrix: 'Matrix',
      ranking: 'Rangfolge',
      dateTime: 'Datum & Zeit',
      fileUpload: 'Datei-Upload',
      drawing: 'Zeichnung',
      reactionTime: 'Reaktionszeit',
      instruction: 'Anweisung',
      webgl: 'WebGL',
      statisticalFeedback: 'Statistisches Feedback'
    },

    properties: {
      questionText: 'Fragetext',
      helpText: 'Hilfetext',
      required: 'Erforderlich',
      optional: 'Optional',
      placeholder: 'Platzhalter',
      minLength: 'Mindestlänge',
      maxLength: 'Höchstlänge',
      minValue: 'Mindestwert',
      maxValue: 'Höchstwert',
      options: 'Optionen',
      addOption: 'Option hinzufügen',
      removeOption: 'Option entfernen',
      allowOther: 'Andere erlauben',
      otherLabel: 'Andere-Label',
      randomizeOptions: 'Optionen randomisieren',
      multiline: 'Mehrzeilig',
      rows: 'Zeilen',
      columns: 'Spalten',
      scaleMin: 'Skala-Minimum',
      scaleMax: 'Skala-Maximum',
      scaleStep: 'Skala-Schritte',
      leftLabel: 'Linkes Label',
      rightLabel: 'Rechtes Label',
      dateFormat: 'Datumsformat',
      timeFormat: 'Zeitformat',
      allowedFormats: 'Erlaubte Formate',
      maxFileSize: 'Maximale Dateigröße',
      canvasWidth: 'Canvas-Breite',
      canvasHeight: 'Canvas-Höhe',
      brushSize: 'Pinselgröße',
      colors: 'Farben',
      stimulus: 'Stimulus',
      responseKey: 'Antworttaste',
      timeoutMs: 'Timeout (ms)',
      instructionText: 'Anweisungstext',
      continueButton: 'Weiter-Button',
      shader: 'Shader',
      duration: 'Dauer',
      feedbackType: 'Feedback-Typ',
      calculation: 'Berechnung'
    },

    validation: {
      required: 'Dieses Feld ist erforderlich',
      minLength: 'Mindestlänge beträgt {{min}} Zeichen',
      maxLength: 'Höchstlänge beträgt {{max}} Zeichen',
      minValue: 'Mindestwert ist {{min}}',
      maxValue: 'Höchstwert ist {{max}}',
      invalidEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
      invalidUrl: 'Bitte geben Sie eine gültige URL ein',
      invalidDate: 'Bitte geben Sie ein gültiges Datum ein',
      invalidTime: 'Bitte geben Sie eine gültige Zeit ein',
      fileTooLarge: 'Dateigröße überschreitet {{max}}',
      invalidFileType: 'Dateityp nicht erlaubt',
      selectAtLeast: 'Bitte wählen Sie mindestens {{min}} Option(en)',
      selectAtMost: 'Bitte wählen Sie höchstens {{max}} Option(en)'
    }
  },

  analytics: {
    overview: {
      title: 'Analytik-Übersicht',
      totalResponses: 'Gesamte Antworten',
      completionRate: 'Abschlussrate',
      averageTime: 'Durchschnittliche Zeit',
      bounceRate: 'Absprungrate',
      lastUpdated: 'Zuletzt aktualisiert'
    },

    charts: {
      responses: 'Antworten',
      completion: 'Abschluss',
      demographics: 'Demografie',
      timeline: 'Zeitlinie',
      heatmap: 'Heatmap',
      funnel: 'Trichter',
      correlation: 'Korrelation',
      distribution: 'Verteilung'
    },

    filters: {
      dateRange: 'Datumsbereich',
      status: 'Status',
      source: 'Quelle',
      device: 'Gerät',
      location: 'Ort',
      customFilter: 'Benutzerdefinierter Filter',
      applyFilters: 'Filter anwenden',
      clearFilters: 'Filter löschen'
    },

    export: {
      title: 'Daten exportieren',
      format: 'Format',
      includeHeaders: 'Header einschließen',
      includeMetadata: 'Metadaten einschließen',
      dateFormat: 'Datumsformat',
      exportAll: 'Alle exportieren',
      exportFiltered: 'Gefilterte exportieren',
      exportSelected: 'Ausgewählte exportieren'
    }
  },

  auth: {
    login: {
      title: 'Anmelden',
      subtitle: 'Willkommen zurück bei QDesigner Modern',
      email: 'E-Mail-Adresse',
      password: 'Passwort',
      remember: 'Angemeldet bleiben',
      forgot: 'Passwort vergessen?',
      submit: 'Anmelden',
      noAccount: 'Noch kein Konto?',
      signUp: 'Registrieren'
    },

    signup: {
      title: 'Konto erstellen',
      subtitle: 'Bei QDesigner Modern anmelden',
      firstName: 'Vorname',
      lastName: 'Nachname',
      email: 'E-Mail-Adresse',
      password: 'Passwort',
      confirmPassword: 'Passwort bestätigen',
      organization: 'Organisation',
      terms: 'Ich stimme den Nutzungsbedingungen zu',
      privacy: 'Ich stimme der Datenschutzerklärung zu',
      submit: 'Konto erstellen',
      hasAccount: 'Bereits ein Konto?',
      signIn: 'Anmelden'
    },

    forgot: {
      title: 'Passwort zurücksetzen',
      subtitle: 'Geben Sie Ihre E-Mail ein, um Anweisungen zu erhalten',
      email: 'E-Mail-Adresse',
      submit: 'Reset-Link senden',
      backToLogin: 'Zurück zur Anmeldung',
      checkEmail: 'Überprüfen Sie Ihre E-Mails für Anweisungen'
    },

    reset: {
      title: 'Passwort zurücksetzen',
      subtitle: 'Geben Sie Ihr neues Passwort ein',
      password: 'Neues Passwort',
      confirmPassword: 'Neues Passwort bestätigen',
      submit: 'Passwort zurücksetzen',
      success: 'Passwort erfolgreich zurückgesetzt'
    },

    logout: {
      title: 'Abmelden',
      message: 'Sind Sie sicher, dass Sie sich abmelden möchten?',
      confirm: 'Abmelden',
      cancel: 'Abbrechen'
    }
  },

  errors: {
    generic: 'Ein Fehler ist aufgetreten',
    network: 'Netzwerkfehler',
    server: 'Serverfehler',
    notFound: 'Nicht gefunden',
    unauthorized: 'Nicht autorisiert',
    forbidden: 'Verboten',
    validation: 'Validierungsfehler',
    timeout: 'Zeitüberschreitung',
    offline: 'Sie sind offline',
    
    codes: {
      400: 'Fehlerhafte Anfrage',
      401: 'Nicht autorisiert',
      403: 'Verboten',
      404: 'Nicht gefunden',
      500: 'Interner Serverfehler',
      502: 'Bad Gateway',
      503: 'Service nicht verfügbar',
      504: 'Gateway-Timeout'
    },

    messages: {
      generic: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
      network: 'Bitte überprüfen Sie Ihre Internetverbindung.',
      server: 'Server ist vorübergehend nicht verfügbar.',
      notFound: 'Die angeforderte Ressource wurde nicht gefunden.',
      unauthorized: 'Bitte melden Sie sich an, um fortzufahren.',
      forbidden: 'Sie haben keine Berechtigung für diese Ressource.',
      validation: 'Bitte überprüfen Sie Ihre Eingabe und versuchen Sie es erneut.',
      timeout: 'Die Anfrage hat zu lange gedauert.',
      offline: 'Einige Funktionen sind möglicherweise offline nicht verfügbar.'
    }
  },

  validation: {
    required: 'Dieses Feld ist erforderlich',
    email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
    minLength: 'Muss mindestens {{min}} Zeichen lang sein',
    maxLength: 'Darf nicht mehr als {{max}} Zeichen haben',
    min: 'Muss mindestens {{min}} sein',
    max: 'Darf nicht mehr als {{max}} sein',
    pattern: 'Ungültiges Format',
    unique: 'Dieser Wert muss eindeutig sein',
    match: 'Werte stimmen nicht überein',
    url: 'Bitte geben Sie eine gültige URL ein',
    phone: 'Bitte geben Sie eine gültige Telefonnummer ein',
    date: 'Bitte geben Sie ein gültiges Datum ein',
    time: 'Bitte geben Sie eine gültige Zeit ein',
    number: 'Bitte geben Sie eine gültige Zahl ein',
    integer: 'Bitte geben Sie eine ganze Zahl ein',
    positive: 'Muss eine positive Zahl sein',
    negative: 'Muss eine negative Zahl sein',
    alpha: 'Nur Buchstaben sind erlaubt',
    alphanumeric: 'Nur Buchstaben und Zahlen sind erlaubt',
    json: 'Ungültiges JSON-Format',
    custom: 'Benutzerdefinierte Validierung fehlgeschlagen'
  }
};