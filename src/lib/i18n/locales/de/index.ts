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
  },

  help: {
    panel: {
      title: 'Hilfe & Lernen',
      searchPlaceholder: 'Hilfethemen durchsuchen...',
      gettingStarted: 'Erste Schritte',
      tours: 'Geführte Touren',
      quickReference: 'Kurzreferenz',
      contextualHelp: 'Kontexthilfe',
      noResults: 'Keine Hilfethemen gefunden',
      startTour: 'Tour starten',
      resumeTour: 'Tour fortsetzen',
      completedBadge: 'Abgeschlossen',
    },

    tours: {
      stepOf: 'Schritt {{current}} von {{total}}',
      next: 'Weiter',
      previous: 'Zurück',
      finish: 'Fertigstellen',
      skip: 'Tour überspringen',
      close: 'Schließen',

      dashboardWelcome: {
        name: 'Dashboard-Einführung',
        description: 'Machen Sie sich mit Ihrem QDesigner-Dashboard vertraut',
      },
      designerIntro: {
        name: 'Designer-Einführung',
        description: 'Lernen Sie das Layout und die Werkzeuge des Fragebogen-Designers kennen',
      },
      variables: {
        name: 'Variablen-Tutorial',
        description: 'Meistern Sie Variablen, Formeln und berechnete Werte',
      },
      flowControl: {
        name: 'Ablaufsteuerung',
        description: 'Richten Sie bedingte Verzweigungen, Schleifen und Sprunglogik ein',
      },
      statisticalFeedback: {
        name: 'Statistisches Feedback',
        description: 'Konfigurieren Sie statistisches Echtzeit-Feedback für Teilnehmende',
      },
      reactionTime: {
        name: 'Reaktionszeit-Einrichtung',
        description: 'Konfigurieren Sie Reaktionszeitmessungsaufgaben',
      },
    },

    steps: {
      dashboard: {
        welcome: { title: 'Willkommen bei QDesigner', description: 'Dies ist Ihre Forschungszentrale. Hier können Sie alle Ihre Fragebögen einsehen, Antworten verfolgen und Abschlussraten überwachen.' },
        questionnaires: { title: 'Ihre Fragebögen', description: 'Jede Karte zeigt einen Fragebogen mit seinem Status, der Anzahl der Antworten und der letzten Aktivität. Klicken Sie auf eine Karte, um sie im Designer zu öffnen.' },
        createNew: { title: 'Ersten Fragebogen erstellen', description: 'Klicken Sie hier, um einen neuen Fragebogen zu erstellen. Sie wählen ein Projekt und konfigurieren grundlegende Einstellungen.' },
        projects: { title: 'Mit Projekten organisieren', description: 'Projekte gruppieren verwandte Fragebögen zusammen. Nutzen Sie sie zur Organisation nach Studie, Kurs oder Forschungsthema.' },
        analytics: { title: 'Antworten analysieren', description: 'Greifen Sie auf leistungsstarke Analysen zu, einschließlich statistischer Tests, Visualisierungen und Datenexport in verschiedenen Formaten.' },
      },
      designer: {
        overview: { title: 'Der Fragebogen-Designer', description: 'Hier erstellen und konfigurieren Sie Ihren Fragebogen. Das Layout besteht aus drei Bereichen: Werkzeugleiste (links), Arbeitsfläche (Mitte) und Eigenschaften (rechts).' },
        toolRail: { title: 'Werkzeugleiste', description: 'Schnellzugriff auf Designer-Werkzeuge. Jedes Symbol öffnet ein Flyout-Panel mit spezialisierten Werkzeugen für die Fragebogenerstellung.' },
        addQuestions: { title: 'Fragen hinzufügen', description: 'Wählen Sie aus über 17 Fragetypen, darunter Texteingabe, Mehrfachauswahl, Skalen, Matrizen, Reaktionszeit und mehr.' },
        canvas: { title: 'Die Arbeitsfläche', description: 'Ihr Fragebogen wird hier angezeigt. Ziehen Sie Fragen per Drag-and-Drop, klicken Sie zum Auswählen und Bearbeiten. Wechseln Sie zwischen visueller und struktureller Ansicht.' },
        properties: { title: 'Eigenschaftenpanel', description: 'Konfigurieren Sie die ausgewählte Frage hier. Legen Sie Pflichtfelder, Validierungsregeln, Anzeigeoptionen und erweiterte Einstellungen fest.' },
        variables: { title: 'Variablen', description: 'Erstellen Sie berechnete Variablen, die Werte speichern, Punktzahlen berechnen und dynamische Logik im gesamten Fragebogen steuern.' },
        flowControl: { title: 'Ablaufsteuerung', description: 'Richten Sie bedingte Navigation ein: Fragen überspringen, zu verschiedenen Pfaden verzweigen, Schleifen erstellen oder basierend auf Antworten vorzeitig beenden.' },
        preview: { title: 'Vorschau', description: 'Testen Sie Ihren Fragebogen genau so, wie ihn die Teilnehmenden sehen werden. Überprüfen Sie den Fragenfluss, die Validierung und das Timing.' },
        publish: { title: 'Veröffentlichen', description: 'Stellen Sie Ihren Fragebogen für Teilnehmende bereit. Generieren Sie einen teilbaren Link oder QR-Code zur Verteilung.' },
        help: { title: 'Brauchen Sie Hilfe?', description: 'Öffnen Sie das Hilfe-Panel für geführte Touren, Kontexthilfe, Formelreferenz und Tastenkürzel.' },
      },
      variables: {
        list: { title: 'Variablenliste', description: 'Alle definierten Variablen werden hier mit ihrem Typ, ihrer Formel und dem aktuellen Wert angezeigt.' },
        add: { title: 'Variable hinzufügen', description: 'Klicken Sie, um eine neue Variable zu erstellen. Wählen Sie einen Namen, Typ und optional eine Formel oder einen Standardwert.' },
        types: { title: 'Variablentypen', description: 'Wählen Sie aus 9 Typen: Zahl, Text, Wahr/Falsch, Datum, Zeit, Liste, Objekt, Reaktionszeit und Stimulus-Onset.' },
        scope: { title: 'Variablen-Gültigkeitsbereich', description: 'Globale Variablen sind im gesamten Fragebogen verfügbar. Seiten- und Block-Bereiche beschränken die Sichtbarkeit.' },
        formula: { title: 'Formeln', description: 'Schreiben Sie Formeln mit über 47 Funktionen: IF(), SUM(), AVG(), CONCAT(), NOW() und mehr. Referenzieren Sie andere Variablen per Name.' },
        defaultValue: { title: 'Standardwerte', description: 'Legen Sie einen Anfangswert fest, der vor jeder Formelberechnung oder Antwort gilt.' },
        dependencies: { title: 'Abhängigkeitsgraph', description: 'Visualisieren Sie, wie Variablen voneinander abhängen. Der Graph wird automatisch aktualisiert, wenn Sie Formeln hinzufügen.' },
      },
      flowControl: {
        list: { title: 'Ablaufsteuerungsliste', description: 'Alle Ablaufsteuerungsregeln werden hier aufgelistet. Regeln werden in der Reihenfolge während der Fragebogenausführung ausgewertet.' },
        add: { title: 'Ablaufsteuerung hinzufügen', description: 'Erstellen Sie Verzweigungen, Sprunglogik, Schleifen oder Abbruchregeln basierend auf den Antworten der Teilnehmenden.' },
        types: { title: 'Ablauftypen', description: 'Verzweigung navigiert bedingt, Sprung überspringt vorwärts, Schleife wiederholt einen Abschnitt, Abbruch beendet den Fragebogen.' },
        condition: { title: 'Bedingungen', description: 'Schreiben Sie Bedingungen mit Variablennamen und JavaScript-Ausdrücken: age >= 18, consent === true, score > 50.' },
        target: { title: 'Ziele', description: 'Wählen Sie, zu welcher Seite oder Frage navigiert werden soll, wenn die Bedingung erfüllt ist.' },
        visualEditor: { title: 'Visueller Ablauf-Editor', description: 'Sehen und bearbeiten Sie den gesamten Ablauf als interaktives Diagramm mit Knoten und Kanten.' },
      },
      statisticalFeedback: {
        source: { title: 'Datenquelle', description: 'Wählen Sie die Datenherkunft: nur aktuelle Sitzung, Kohortenaggregate oder Teilnehmervergleich.' },
        metric: { title: 'Statistische Metriken', description: 'Wählen Sie die anzuzeigende Metrik: Mittelwert, Median, Standardabweichung, Perzentile oder Z-Werte.' },
        chart: { title: 'Diagrammvisualisierung', description: 'Wählen Sie einen Diagrammtyp zur Datenvisualisierung: Histogramm, Balkendiagramm, Liniendiagramm oder Anzeige.' },
        interpretation: { title: 'Punktzahl-Interpretation', description: 'Definieren Sie Bereiche (z. B. Niedrig/Mittel/Hoch) mit Farben, um Teilnehmenden das Verständnis ihrer Ergebnisse zu erleichtern.' },
        preview: { title: 'Live-Vorschau', description: 'Sehen Sie eine Echtzeitvorschau, wie das statistische Feedback für die Teilnehmenden erscheinen wird.' },
      },
      reactionTime: {
        taskType: { title: 'Reaktionszeitaufgaben', description: 'Wählen Sie ein Aufgabenparadigma: Einfache RZ, Wahl-RZ, Go/No-Go, Stroop, Flanker, IAT oder benutzerdefiniert.' },
        stimulus: { title: 'Stimuli konfigurieren', description: 'Richten Sie die Stimuli ein, auf die Teilnehmende reagieren: Text, Bilder, Farben oder benutzerdefinierte WebGL-Inhalte.' },
        timing: { title: 'Timing-Einstellungen', description: 'Konfigurieren Sie das Timing mit Mikrosekunden-Präzision: Stimulusdauer, Inter-Stimulus-Intervall, Antwort-Timeout.' },
        trials: { title: 'Versuchssequenz', description: 'Definieren Sie die Versuchsreihenfolge, Randomisierung und Blockstruktur für Ihre Reaktionszeitaufgabe.' },
        practice: { title: 'Übungsdurchgänge', description: 'Fügen Sie Übungsdurchgänge mit Feedback hinzu, damit Teilnehmende die Aufgabe vor der Datenerhebung erlernen können.' },
      },
    },

    tips: {
      required: 'Wenn aktiviert, müssen Teilnehmende diese Frage beantworten, bevor sie zur nächsten Seite gelangen.',
      validation: 'Fügen Sie Validierungsregeln hinzu, um die Antwortqualität sicherzustellen: Min./Max.-Länge, Muster, benutzerdefinierte Ausdrücke.',
      carryForward: 'Optionen oder Antworten einer vorherigen Frage automatisch in diese übernehmen.',
      attentionCheck: 'Markieren Sie diese Frage als Aufmerksamkeitsprüfung. Fehlgeschlagene Prüfungen können Datenqualitätswarnungen auslösen.',
      randomizeOptions: 'Die Reihenfolge der Antwortoptionen für jeden Teilnehmenden zufällig mischen, um Reihenfolgeeffekte zu reduzieren.',
      allowOther: 'Eine Freitext-Option „Sonstiges" hinzufügen, damit Teilnehmende Antworten geben können, die nicht in Ihrer vordefinierten Liste stehen.',
      multiline: 'Teilnehmenden erlauben, mehrzeiligen Text einzugeben. Nützlich für offene qualitative Antworten.',
      scaleLabels: 'Beschriftungen an den Endpunkten und dem Mittelpunkt Ihrer Skala hinzufügen, um Teilnehmenden die Interpretation der Werte zu erleichtern.',
      matrixRows: 'Jede Zeile repräsentiert ein separates Item, das Teilnehmende mit denselben Spaltenoptionen bewerten.',
      variableType: 'Der Datentyp bestimmt, welche Werte die Variable enthalten kann und welche Operationen gültig sind.',
      variableScope: 'Global: überall verfügbar. Seite: wird pro Seite zurückgesetzt. Block: wird pro Block zurückgesetzt.',
      variableFormula: 'Formeln werden automatisch mit über 47 Funktionen berechnet. Referenzieren Sie andere Variablen per Name: SUM(score1, score2).',
      variableDefault: 'Der Anfangswert vor jeder Formelberechnung oder Teilnehmerantwort.',
      flowType: 'Verzweigung: bedingte Navigation. Sprung: vorwärts springen. Schleife: Abschnitt wiederholen. Abbruch: Fragebogen beenden.',
      flowCondition: 'JavaScript-Ausdruck mit Variablennamen: age >= 18 && consent === true.',
      flowTarget: 'Die Seite oder Frage, zu der navigiert wird, wenn die Bedingung als wahr ausgewertet wird.',
      flowIterations: 'Maximale Anzahl der Schleifenwiederholungen. Verwenden Sie Bedingungen für vorzeitigen Abbruch.',
      sourceMode: 'Aktuelle Sitzung: nur dieser Teilnehmende. Kohorte: alle Teilnehmenden. Vergleich: Teilnehmender vs. Gruppe.',
      metric: 'Das zu berechnende und anzuzeigende statistische Maß: Mittelwert, Median, Perzentile, Z-Wert usw.',
      chartType: 'Wie die Daten visualisiert werden. Histogramme zeigen Verteilungen, Balkendiagramme vergleichen Kategorien.',
      scoreInterpretation: 'Definieren Sie Punktzahlbereiche mit Beschriftungen und Farben, um Teilnehmenden aussagekräftiges Feedback zu geben.',
      formulaEditor: 'Schreiben Sie Formeln mit integrierten Funktionen. Drücken Sie Strg+Leertaste für Autovervollständigung.',
    },

    formulas: {
      title: 'Formelreferenz',
      searchPlaceholder: 'Funktionen durchsuchen...',
      categories: {
        math: 'Mathematik',
        array: 'Array & Aggregation',
        string: 'Text',
        conditional: 'Bedingt',
        time: 'Datum & Zeit',
        random: 'Zufall',
        statistical: 'Statistisch',
        psychometric: 'Psychometrisch',
      },
      parameters: 'Parameter',
      returns: 'Rückgabewert',
      example: 'Beispiel',
      noResults: 'Keine passenden Funktionen gefunden',
    },

    shortcuts: {
      title: 'Tastenkürzel',
      sections: {
        general: 'Allgemein',
        editing: 'Bearbeitung',
        navigation: 'Navigation',
        panels: 'Panels',
      },
      save: 'Speichern',
      undo: 'Rückgängig',
      redo: 'Wiederholen',
      preview: 'Vorschau umschalten',
      commandPalette: 'Befehlspalette',
      duplicate: 'Auswahl duplizieren',
      delete: 'Auswahl löschen',
      addQuestion: 'Frage hinzufügen',
      publish: 'Veröffentlichen',
      moveUp: 'Nach oben verschieben',
      moveDown: 'Nach unten verschieben',
      copyQuestion: 'Frage kopieren',
      pasteQuestion: 'Frage einfügen',
      closePanel: 'Schließen / Auswahl aufheben',
      showShortcuts: 'Tastenkürzel anzeigen',
    },

    beacon: {
      newFeature: 'Neue Funktion',
      clickToLearn: 'Klicken Sie, um mehr zu erfahren',
    },
  }
};