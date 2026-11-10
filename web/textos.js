// Textos de la interfaz en español e inglés. Sin DOM.
//
// Cada texto es una cadena con marcadores {variable} o una función para los que
// cambian según el número. Lo que viene de las fuentes (nombres de calles,
// paradas, destinos) no se traduce: se queda como se dice en Cuenca.

export const IDIOMAS = ["es", "en"];

const TEXTOS = {
  es: {
    titulo: "Morlaco: tu calle hoy en Cuenca",
    cambiarIdioma: "English",
    cambiarIdiomaAria: "Switch to English",
    enlaceDatos: "Datos abiertos y código",
    instalar: "Instalar",
    instalarAria: "Instalar Morlaco como app en este dispositivo",
    sinConexion: "Sin conexión: ves los últimos datos guardados en este dispositivo.",
    portadaTitulo: "¿Qué pasa hoy en tu calle?",
    portadaEntrada:
      "Cuándo pasa el recolector, si hay cortes de luz programados y qué paradas de bus tienes cerca, en Cuenca.",
    etiquetaBusqueda: "Tu esquina o un lugar conocido",
    buscar: "Buscar",
    ubicarme: "Usar mi ubicación",
    tocaMapa: "o toca tu calle en el mapa.",
    pruebaCon: "Prueba con",
    avanceBasura:
      "<strong>Recolección de basura.</strong> Qué días y a qué hora pasa el recolector, y cuándo sacar la funda celeste.",
    avanceLuz: "<strong>Cortes de luz.</strong> Los cortes que Centro Sur programó para hoy.",
    avanceBuses:
      "<strong>Buses.</strong> Qué bus te lleva a donde vas, las líneas cercanas y cada cuánto pasan.",
    avanceFarmacias:
      "<strong>Farmacias de turno.</strong> Las que abren las 24 horas esta semana, la más cercana primero.",
    tuPunto: "Tu punto",
    cambiarPunto: "Cambiar",
    hoyEnTuCalle: "Hoy en tu calle",
    seccionesAria: "Secciones de la respuesta",
    navBasura: "Basura",
    navLuz: "Luz",
    navFarmacias: "Farmacias",
    navBuses: "Buses",
    puntoMapaNombre: "Punto elegido en el mapa",
    tuUbicacion: "Tu ubicación",
    puntoGuardado: "Tu último punto",
    zonaRecoleccion: "Zona {zona} de recolección",
    sinDatos: "Sin datos",
    resumenLuzHoy: ({ n }) => `${n} ${n === 1 ? "corte hoy" : "cortes hoy"}`,
    resumenLuzSinDatos: "Sin datos recientes",
    resumenLuzDesde: "Centro Sur no publica desde el {fecha}",
    resumenLuzSinCortes: "Sin cortes publicados",
    resumenLuzFuente: "Según Centro Sur",
    resumenFarmacias: ({ n }) => `${n} de turno`,
    resumenFarmaciaCerca: "La más cercana a unos {distancia}",
    resumenFarmaciasHasta: "Hasta el {fecha}, 06:00",
    resumenFarmaciasSin: "Sin turnos publicados",
    resumenLineas: ({ n }) => `${n} ${n === 1 ? "línea cerca" : "líneas cerca"}`,
    resumenLineaCerca: "La {linea} a {distancia}",
    resumenTranviaCerca: "El tranvía a {distancia}",
    resumenSinLineas: "Ninguna a menos de 350 m",
    tituloBasura: "Recolección de basura",
    semanaAria: "Días de recolección en tu zona",
    tituloLuz: "Cortes de luz programados",
    tituloBuses: "Buses cerca de ti",
    subtituloLineas: "Líneas que pasan cerca",
    subtituloRuta: "¿Qué bus me lleva?",
    etiquetaDestino: "¿A dónde vas? Escribe una esquina o un lugar",
    buscarRuta: "Buscar ruta",
    rutaBuscando: "Buscando la mejor ruta…",
    rutaNinguna:
      "No encontré buses que unan estos dos puntos con menos de 500 m a pie en cada extremo. Prueba con un destino cerca de una avenida.",
    rutaDestino: "Hacia {texto}.",
    rutaMinutos: "{n} min",
    rutaPie: "A pie",
    rutaTransbordo: "con transbordo",
    pasoCaminarA: "Camina {distancia} hasta la línea {linea}",
    pasoCaminarATranvia: "Camina {distancia} hasta el tranvía",
    pasoCerca: " (cerca de {parada})",
    pasoTomar: "Toma la línea {linea} hacia {hacia}: {distancia} en bus",
    pasoTomarTranvia: "Toma el tranvía hacia {hacia}: {distancia}",
    pasoFrecuencia: ", cada {minutos} min",
    pasoCambiar: "Bájate y camina {distancia} hasta la línea {linea}",
    pasoLlegar: "Bájate y camina {distancia} hasta tu destino",
    pasoSoloPie: "Camina unos {distancia}",
    rutaFueraHorario: "A esta hora no pasa",
    rutaTranviaHorario: "Horario del tranvía en tranvia.cuenca.gob.ec",
    rutaNota:
      "Tiempos estimados con la frecuencia de hoy, a 15 km/h en bus y 4,5 km/h a pie. Recorridos del municipio de 2022: confirma con el letrero del bus. Toca una opción para verla en el mapa.",
    subtituloParadas: "Paradas registradas más cerca",
    mapaAria: "Mapa de zonas de recolección",
    leyendaLmv: "Lunes, miércoles y viernes",
    leyendaMjs: "Martes, jueves y sábado",
    capaBicis: "BiciPública",
    capaCiclovias: "Ciclovías",
    capaCarga: "Carga de autos eléctricos",
    cicloviaSeparada: "Ciclovía separada",
    cicloviaCarril: "Carril para bicicleta",
    accesoPublico: "Público",
    accesoClientes: "Solo para clientes",
    accesoPrivado: "Privado",
    subtituloBici: "BiciPública más cercana",
    bicicletaAnclajes: ({ n }) => `${n} ${n === 1 ? "anclaje" : "anclajes"}`,
    bicicletaNinguna: "No hay estaciones de BiciPública a menos de 1,5 km.",
    bicicletaNota: "Ubicación de OpenStreetMap. Activa las capas del mapa (arriba a la derecha) para ver las estaciones, las ciclovías y los puntos de carga.",
    pieFuentes:
      'Datos de <a href="https://emac.gob.ec/mapa-zonas-de-recoleccion/">EMAC EP</a>, <a href="https://www.centrosur.gob.ec/suspensiones-programadas/">Centro Sur</a> y el portal <a href="https://cuencaendatos.cuenca.gob.ec">Cuenca en Datos</a> del GAD Municipal. Calles: © colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL).',
    pieColaborar:
      '¿Un dato está mal o no encuentra tu esquina? <a href="https://github.com/NezuSas/morlaco/issues/new/choose">Avísanos</a> (necesitas una cuenta de GitHub, es gratis). ¿Programas? <a href="https://github.com/NezuSas/morlaco/blob/main/CONTRIBUTING.md">Colabora con Morlaco</a>. Las rutas de bus también están en <a href="../datos/gtfs/cuenca-buses.zip">formato GTFS</a> para apps de transporte.',
    pieAviso:
      "Morlaco no es un servicio oficial. Ante cualquier duda, consulta la fuente. Las calles se buscan en esta página; solo cuando buscas un lugar (como un parque o un centro comercial), el texto se envía a OpenStreetMap (Nominatim) para ubicarlo.",
    actualizado: "Datos actualizados el {fecha}.",

    dias: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    iniciales: ["L", "M", "M", "J", "V", "S", "D"],
    y: "y",
    hoy: "hoy",
    recoleccionAhora: "Pasando ahora, hasta las {hasta}",
    recoleccionHoy: "Hoy, de {desde} a {hasta}",
    recoleccionManana: "Mañana, de {desde} a {hasta}",
    recoleccionDia: "El {dia}, de {desde} a {hasta}",
    diaConCeleste: "recolección, con funda celeste",
    diaRecoleccion: "recolección",
    diaSinRecoleccion: "sin recolección",
    fueraZonas: "Fuera de las zonas urbanas",
    fueraZonasDetalle:
      "Ese punto no está en ninguna de las 8 zonas urbanas de EMAC. En el área rural la recolección tiene otros horarios: consulta con EMAC EP.",
    fundasConCeleste: "Ese día saca la [negra]funda negra y también la [celeste]funda celeste con los reciclables.",
    fundasNormal: "Saca la [negra]funda negra. La [celeste]funda celeste, con reciclables, va el {dia}.",
    fundasSoloNegra: "Saca la [negra]funda negra antes de la hora.",
    zonaDetalle: "Zona {zona} de EMAC. Deja las fundas antes de que empiece el horario.",
    zonaTooltip: "Zona {zona}: {dias}, de {desde} a {hasta}",
    calendarioTitulo: "Recibe un aviso antes de cada recolección",
    calendarioApple: "iPhone, Mac u Outlook",
    calendarioDescargar: "Descargar el archivo",
    calendarioNota:
      "El calendario se actualiza solo si EMAC cambia los horarios. En Google Calendar, abre la configuración de “Cuenca limpia” para elegirle un color (Google lo pone gris) y activar las notificaciones.",

    luzError: "No se pudieron cargar los cortes de luz. Prueba de nuevo más tarde.",
    luzFuente: "página de Centro Sur",
    luzSinPublicar: "Centro Sur no publica cortes programados desde el {fecha}.",
    luzSinPublicarResto:
      " Puede que no haya cortes, o que no los esté anunciando en su web. Revisa también sus redes sociales o la ",
    luzNoHayHoy: "No hay cortes programados publicados para hoy. Fuente: ",
    corteHorario: "De {desde} a {hasta}",
    cortesNinguno: "Ningún corte de hoy coincide con esa calle o sector.",
    filtroCortes: "Filtra por calle o sector",
    filtroCortesAria: "Filtrar cortes por calle o sector",
    luzResumen: ({ n }) =>
      `Hoy hay ${n} ${n === 1 ? "corte programado" : "cortes programados"} en la zona de Centro Sur.`,
    luzSinCoordenadas: "Centro Sur no publica coordenadas: busca tu calle o sector en la lista.",
    tituloFarmacias: "Farmacias de turno",
    farmaciasResumen: ({ n, fecha }) =>
      `Hasta el ${fecha} a las 06:00, ${n === 1 ? "está de turno 1 farmacia" : `están de turno ${n} farmacias`} en Cuenca, abiertas las 24 horas.`,
    farmaciasAviso: "Datos de ARCSA, que pueden tener errores: llama antes de ir.",
    farmaciasSinTurno: "ARCSA no ha publicado los turnos de esta semana. Consulta su ",
    farmaciasError: "No se pudieron cargar las farmacias de turno.",
    farmaciasFiltro: "Filtra por nombre, calle o barrio",
    farmaciasFiltroAria: "Filtrar farmacias por nombre, calle o barrio",
    farmaciasNinguna: "Ninguna farmacia de turno coincide con eso.",
    farmaciasPdf: "PDF oficial de ARCSA",
    farmaciasOrden: "Ordenadas por cercanía aproximada a tu punto, según la dirección que publica ARCSA.",
    farmaciasFuente: "Fuente: ",
    llamar: "Llamar al {telefono}",
    aproximado: "a unos {distancia}",
    verMasFarmacias: ({ n }) => `Ver ${n} ${n === 1 ? "farmacia más" : "farmacias más"}`,

    paradasNinguna: "No hay paradas registradas a menos de 1,5 km.",
    paradasNota: "Según el registro de paradas del municipio, que no incluye todas. Las distancias son en línea recta.",
    lineasError: "No se pudieron cargar las líneas de bus.",
    lineasNinguna: "Ninguna línea pasa a menos de 350 m de este punto.",
    lineasNota:
      "Toca una línea para verla en el mapa. Trazados publicados por el municipio en 2022 y horarios de 2025: algunas líneas pueden haber cambiado.",
    tranvia: "Tranvía",
    tranviaDetalle: "Próximos trenes en tranvia.cuenca.gob.ec",
    linea: "Línea {linea}",
    verMas: ({ n }) => `Ver ${n} ${n === 1 ? "línea más" : "líneas más"}`,
    frecuenciaCada: "Cada {minutos} min",
    frecuenciaPasa: "Pasa",
    frecuenciaFranja: "de {inicio} a {fin}",
    frecuenciaYaNo: "Hoy {franja}; a esta hora ya no pasa",
    frecuenciaEmpieza: "Empieza a las {inicio}; hoy {franja}",
    frecuenciaSinServicio: "Hoy no tiene servicio",
    frecuenciaSinHorario: "Sin horario publicado",
    destinosEntre: "Entre {a} y {b}",
    destinosHacia: "Hacia {a}",

    buscando: "Buscando…",
    encontrado: "Encontrado: {texto}.",
    puntoMapa: "Punto elegido en el mapa.",
    buscandoUbicacion: "Buscando tu ubicación…",
    usandoUbicacion: "Usando tu ubicación actual.",
    reportar: "¿Es un error? Avísanos",
    busquedaSinRespuesta: "La búsqueda de direcciones no respondió. Prueba de nuevo o toca el mapa.",
    errorDatos: "No se pudieron cargar los datos de Morlaco. Recarga la página para intentarlo de nuevo.",
    noCalle: "No encontré la calle “{calle}” en Cuenca. Revisa cómo está escrita.",
    noSeCruzan: "Según el mapa, {a} y {b} no se cruzan. Revisa los nombres o toca el mapa.",
    numerosCasa: "Los números de casa no están en el mapa.",
    calleLarga: "La {calle} es larga y cruza varias zonas.",
    escribeCruce: "Escribe también una calle que la cruce, por ejemplo “{calle} y …”, o toca el punto exacto en el mapa.",
    noLugar: "No encontré ese lugar en Cuenca. Prueba con dos calles que se crucen, como “Sucre y Borrero”, o toca el mapa.",
    cruce: "{a} y {b}",
    geoNoSoportado: "Este navegador no permite compartir la ubicación.",
    geoSinPermiso: "El navegador no dio permiso para usar tu ubicación. Escribe tu dirección o toca el mapa.",
    geoError: "No se pudo obtener tu ubicación. Escribe tu dirección o toca el mapa.",
  },

  en: {
    titulo: "Morlaco: your street today in Cuenca",
    cambiarIdioma: "Español",
    cambiarIdiomaAria: "Cambiar a español",
    enlaceDatos: "Open data and code",
    instalar: "Install",
    instalarAria: "Install Morlaco as an app on this device",
    sinConexion: "You’re offline: showing the last data saved on this device.",
    portadaTitulo: "What’s happening on your street today?",
    portadaEntrada:
      "When the garbage truck comes, whether there are scheduled power cuts and which buses stop near you, in Cuenca.",
    etiquetaBusqueda: "Your corner or a well-known place",
    buscar: "Search",
    ubicarme: "Use my location",
    tocaMapa: "or tap your street on the map.",
    pruebaCon: "Try",
    avanceBasura:
      "<strong>Garbage collection.</strong> Which days and at what time the truck comes, and when to put out the light-blue recycling bag.",
    avanceLuz: "<strong>Power cuts.</strong> Outages Centro Sur has scheduled for today.",
    avanceBuses:
      "<strong>Buses.</strong> Which bus gets you there, nearby lines and how often they run.",
    avanceFarmacias:
      "<strong>Pharmacies on duty.</strong> Those open 24 hours this week, closest first.",
    tuPunto: "Your spot",
    cambiarPunto: "Change",
    hoyEnTuCalle: "Today on your street",
    seccionesAria: "Answer sections",
    navBasura: "Garbage",
    navLuz: "Power",
    navFarmacias: "Pharmacies",
    navBuses: "Buses",
    puntoMapaNombre: "Point chosen on the map",
    tuUbicacion: "Your location",
    puntoGuardado: "Your last spot",
    zonaRecoleccion: "Garbage zone {zona}",
    sinDatos: "No data",
    resumenLuzHoy: ({ n }) => `${n} ${n === 1 ? "outage today" : "outages today"}`,
    resumenLuzSinDatos: "No recent data",
    resumenLuzDesde: "Centro Sur hasn’t published since {fecha}",
    resumenLuzSinCortes: "No outages published",
    resumenLuzFuente: "According to Centro Sur",
    resumenFarmacias: ({ n }) => `${n} on duty`,
    resumenFarmaciaCerca: "Closest about {distancia} away",
    resumenFarmaciasHasta: "Until {fecha}, 06:00",
    resumenFarmaciasSin: "No rota published",
    resumenLineas: ({ n }) => `${n} ${n === 1 ? "line nearby" : "lines nearby"}`,
    resumenLineaCerca: "Line {linea}, {distancia} away",
    resumenTranviaCerca: "The tram, {distancia} away",
    resumenSinLineas: "None within 350 m",
    tituloBasura: "Garbage collection",
    semanaAria: "Collection days in your zone",
    tituloLuz: "Scheduled power cuts",
    tituloBuses: "Buses near you",
    subtituloLineas: "Lines that pass nearby",
    subtituloRuta: "Which bus gets me there?",
    etiquetaDestino: "Where are you going? Type a corner or a place",
    buscarRuta: "Find route",
    rutaBuscando: "Finding the best route…",
    rutaNinguna:
      "I couldn’t find buses connecting these two points with less than 500 m of walking at each end. Try a destination near a main avenue.",
    rutaDestino: "To {texto}.",
    rutaMinutos: "{n} min",
    rutaPie: "On foot",
    rutaTransbordo: "with a transfer",
    pasoCaminarA: "Walk {distancia} to line {linea}",
    pasoCaminarATranvia: "Walk {distancia} to the tram",
    pasoCerca: " (near {parada})",
    pasoTomar: "Take line {linea} towards {hacia}: {distancia} by bus",
    pasoTomarTranvia: "Take the tram towards {hacia}: {distancia}",
    pasoFrecuencia: ", every {minutos} min",
    pasoCambiar: "Get off and walk {distancia} to line {linea}",
    pasoLlegar: "Get off and walk {distancia} to your destination",
    pasoSoloPie: "Walk about {distancia}",
    rutaFueraHorario: "Not running at this hour",
    rutaTranviaHorario: "Tram hours at tranvia.cuenca.gob.ec",
    rutaNota:
      "Estimated times using today’s frequency, 15 km/h by bus and 4.5 km/h on foot. City routes from 2022: check the sign on the bus. Tap an option to see it on the map.",
    subtituloParadas: "Closest registered stops",
    mapaAria: "Map of garbage collection zones",
    leyendaLmv: "Monday, Wednesday and Friday",
    leyendaMjs: "Tuesday, Thursday and Saturday",
    capaBicis: "BiciPública bike share",
    capaCiclovias: "Bike lanes",
    capaCarga: "EV charging",
    cicloviaSeparada: "Separated bike lane",
    cicloviaCarril: "Painted bike lane",
    accesoPublico: "Public",
    accesoClientes: "Customers only",
    accesoPrivado: "Private",
    subtituloBici: "Closest BiciPública station",
    bicicletaAnclajes: ({ n }) => `${n} ${n === 1 ? "dock" : "docks"}`,
    bicicletaNinguna: "There are no BiciPública stations within 1.5 km.",
    bicicletaNota: "Location from OpenStreetMap. Turn on the map layers (top right) to see stations, bike lanes and charging points.",
    pieFuentes:
      'Data from <a href="https://emac.gob.ec/mapa-zonas-de-recoleccion/">EMAC EP</a>, <a href="https://www.centrosur.gob.ec/suspensiones-programadas/">Centro Sur</a> and the city’s <a href="https://cuencaendatos.cuenca.gob.ec">Cuenca en Datos</a> portal. Streets: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL).',
    pieColaborar:
      'Is something wrong, or can’t it find your corner? <a href="https://github.com/NezuSas/morlaco/issues/new/choose">Let us know</a> (you need a free GitHub account). Do you code? <a href="https://github.com/NezuSas/morlaco/blob/main/CONTRIBUTING.md">Help build Morlaco</a>. Bus routes are also available in <a href="../datos/gtfs/cuenca-buses.zip">GTFS format</a> for transit apps.',
    pieAviso:
      "Morlaco is not an official service. If in doubt, check the source. Streets are searched on this page; only when you search for a place (like a park or a mall) is the text sent to OpenStreetMap (Nominatim) to find it.",
    actualizado: "Data updated on {fecha}.",

    dias: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    iniciales: ["M", "T", "W", "T", "F", "S", "S"],
    y: "and",
    hoy: "today",
    recoleccionAhora: "Passing now, until {hasta}",
    recoleccionHoy: "Today, {desde} to {hasta}",
    recoleccionManana: "Tomorrow, {desde} to {hasta}",
    recoleccionDia: "On {dia}, {desde} to {hasta}",
    diaConCeleste: "collection, with the light-blue bag",
    diaRecoleccion: "collection",
    diaSinRecoleccion: "no collection",
    fueraZonas: "Outside the urban zones",
    fueraZonasDetalle:
      "That point isn’t in any of EMAC’s 8 urban zones. Rural areas have other collection times: check with EMAC EP.",
    fundasConCeleste: "That day, put out the [negra]black bag and also the [celeste]light-blue bag with recyclables.",
    fundasNormal: "Put out the [negra]black bag. The [celeste]light-blue bag, with recyclables, goes out on {dia}.",
    fundasSoloNegra: "Put out the [negra]black bag before the collection time.",
    zonaDetalle: "EMAC zone {zona}. Put the bags out before the collection window starts.",
    zonaTooltip: "Zone {zona}: {dias}, {desde} to {hasta}",
    calendarioTitulo: "Get a reminder before every collection",
    calendarioApple: "iPhone, Mac or Outlook",
    calendarioDescargar: "Download the file",
    calendarioNota:
      "The calendar updates by itself if EMAC changes the schedule. Event names are in Spanish. In Google Calendar, open the settings of “Cuenca limpia” to give it a color (Google makes it grey) and turn on notifications.",

    luzError: "Power cut data couldn’t be loaded. Please try again later.",
    luzFuente: "Centro Sur’s page",
    luzSinPublicar: "Centro Sur hasn’t published scheduled outages since {fecha}.",
    luzSinPublicarResto:
      " There may be no outages, or they may not be announcing them on their website. Also check their social media or ",
    luzNoHayHoy: "No scheduled outages have been published for today. Source: ",
    corteHorario: "From {desde} to {hasta}",
    cortesNinguno: "None of today’s outages match that street or area.",
    filtroCortes: "Filter by street or area",
    filtroCortesAria: "Filter outages by street or area",
    luzResumen: ({ n }) =>
      `Today there ${n === 1 ? "is 1 scheduled outage" : `are ${n} scheduled outages`} in Centro Sur’s area.`,
    luzSinCoordenadas: "Centro Sur doesn’t publish coordinates: look for your street or area in the list.",
    tituloFarmacias: "Pharmacies on duty",
    farmaciasResumen: ({ n, fecha }) =>
      `Until ${fecha} at 06:00, ${n === 1 ? "1 pharmacy is" : `${n} pharmacies are`} on duty in Cuenca, open 24 hours.`,
    farmaciasAviso: "Data from ARCSA, which may contain errors: call before you go.",
    farmaciasSinTurno: "ARCSA hasn’t published this week’s rota. Check their ",
    farmaciasError: "Pharmacies on duty couldn’t be loaded.",
    farmaciasFiltro: "Filter by name, street or neighborhood",
    farmaciasFiltroAria: "Filter pharmacies by name, street or neighborhood",
    farmaciasNinguna: "No pharmacy on duty matches that.",
    farmaciasPdf: "official ARCSA PDF",
    farmaciasOrden: "Sorted by approximate distance from your point, based on the address ARCSA publishes.",
    farmaciasFuente: "Source: ",
    llamar: "Call {telefono}",
    aproximado: "about {distancia} away",
    verMasFarmacias: ({ n }) => `Show ${n} more ${n === 1 ? "pharmacy" : "pharmacies"}`,

    paradasNinguna: "There are no registered stops within 1.5 km.",
    paradasNota: "From the city’s register of stops, which doesn’t include all of them. Distances are in a straight line.",
    lineasError: "Bus lines couldn’t be loaded.",
    lineasNinguna: "No line passes within 350 m of this point.",
    lineasNota:
      "Tap a line to see it on the map. Routes published by the city in 2022 and timetables from 2025: some lines may have changed.",
    tranvia: "Tram",
    tranviaDetalle: "Next trains at tranvia.cuenca.gob.ec",
    linea: "Line {linea}",
    verMas: ({ n }) => `Show ${n} more ${n === 1 ? "line" : "lines"}`,
    frecuenciaCada: "Every {minutos} min",
    frecuenciaPasa: "Runs",
    frecuenciaFranja: "{inicio} to {fin}",
    frecuenciaYaNo: "Today {franja}; no more buses at this hour",
    frecuenciaEmpieza: "Starts at {inicio}; today {franja}",
    frecuenciaSinServicio: "No service today",
    frecuenciaSinHorario: "No published timetable",
    destinosEntre: "Between {a} and {b}",
    destinosHacia: "To {a}",

    buscando: "Searching…",
    encontrado: "Found: {texto}.",
    puntoMapa: "Point chosen on the map.",
    buscandoUbicacion: "Finding your location…",
    usandoUbicacion: "Using your current location.",
    reportar: "Is this wrong? Let us know",
    busquedaSinRespuesta: "The address search didn’t respond. Try again or tap the map.",
    errorDatos: "Morlaco’s data couldn’t be loaded. Reload the page to try again.",
    noCalle: "I couldn’t find the street “{calle}” in Cuenca. Check the spelling.",
    noSeCruzan: "According to the map, {a} and {b} don’t cross. Check the names or tap the map.",
    numerosCasa: "House numbers aren’t on the map.",
    calleLarga: "{calle} is long and crosses several zones.",
    escribeCruce: "Add a street that crosses it, for example “{calle} y …”, or tap the exact spot on the map.",
    noLugar: "I couldn’t find that place in Cuenca. Try two streets that cross, like “Sucre y Borrero”, or tap the map.",
    cruce: "{a} and {b}",
    geoNoSoportado: "This browser can’t share your location.",
    geoSinPermiso: "The browser didn’t allow access to your location. Type your address or tap the map.",
    geoError: "Your location couldn’t be found. Type your address or tap the map.",
  },
};

let actual = "es";

/** El idioma guardado si es válido; si no, inglés cuando el navegador está en inglés; si no, español. */
export function idiomaInicial(guardado, delNavegador = []) {
  if (IDIOMAS.includes(guardado)) return guardado;
  const preferido = [delNavegador].flat().find((i) => /^(es|en)\b/i.test(i ?? ""));
  return preferido?.slice(0, 2).toLowerCase() === "en" ? "en" : "es";
}

export function usarIdioma(idioma) {
  actual = IDIOMAS.includes(idioma) ? idioma : "es";
}

export function idioma() {
  return actual;
}

/** El texto de una clave en el idioma actual, con sus variables. */
export function t(clave, variables = {}) {
  const valor = TEXTOS[actual][clave] ?? TEXTOS.es[clave];
  if (valor === undefined) throw new Error(`Falta el texto "${clave}"`);
  if (typeof valor === "function") return valor(variables);
  if (typeof valor !== "string") return valor;
  return valor.replace(/\{(\w+)\}/g, (_, nombre) => String(variables[nombre] ?? ""));
}

/** "a, b y c" o "a, b and c". */
export function listar(elementos) {
  if (elementos.length <= 1) return elementos.join("");
  return `${elementos.slice(0, -1).join(", ")} ${t("y")} ${elementos.at(-1)}`;
}

/** Las claves que faltan en algún idioma (para las pruebas). */
export function clavesQueFaltan() {
  const todas = new Set(IDIOMAS.flatMap((i) => Object.keys(TEXTOS[i])));
  return IDIOMAS.flatMap((i) => [...todas].filter((c) => !(c in TEXTOS[i])).map((c) => `${i}:${c}`));
}

/** Código de idioma para Intl y el atributo lang. */
export function etiquetaIdioma() {
  return actual === "en" ? "en" : "es-EC";
}
