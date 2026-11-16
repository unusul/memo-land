import type { ModelSection } from './types.js';

/** The sections of the ready model «Supermercato», in the user's order (2026-11-16). «altro» takes the unknown items. */
export const SUPERMARKET_SECTIONS: readonly ModelSection[] = [
  { id: 'frutta', name: 'Frutta e verdura' },
  { id: 'frigo', name: 'Banco frigo' },
  { id: 'pane', name: 'Panetteria' },
  { id: 'colazione', name: 'Colazione e dolci' },
  { id: 'pasta', name: 'Pasta e riso' },
  { id: 'conserve', name: 'Conserve' },
  { id: 'scatolame', name: 'Scatolame' },
  { id: 'condimenti', name: 'Condimenti e spezie' },
  { id: 'bevande', name: 'Bevande' },
  { id: 'surgelati', name: 'Surgelati' },
  { id: 'casa', name: 'Casa e pulizia' },
  { id: 'igiene', name: 'Igiene personale' },
  { id: 'altro', name: 'Altro' },
];

/**
 * The items of the ready model «Supermercato» by section: common products, vegetarian (user's choice, 2026-11-16: no
 * meat, fish or cold cuts). A new model made from it gets them all, to change as the group likes.
 */
export const SUPERMARKET_ITEMS: Readonly<Record<string, readonly string[]>> = {
  frutta: [
    'mela', 'pera', 'banana', 'arancia', 'mandarino', 'clementina', 'limone', 'lime', 'pompelmo', 'kiwi', 'uva', 'fragola',
    'ciliegia', 'pesca', 'albicocca', 'prugna', 'susina', 'melone', 'anguria', 'ananas', 'mango', 'avocado', 'fico',
    'cachi', 'melagrana', 'mirtillo', 'lampone', 'mora', 'frutta', 'verdura', 'insalata', 'lattuga', 'rucola', 'valeriana',
    'spinaci', 'bietola', 'cavolo', 'cavolfiore', 'broccolo', 'verza', 'cavolo nero', 'cavolini di bruxelles', 'carota',
    'zucchina', 'zucca', 'melanzana', 'peperone', 'pomodoro', 'pomodorino', 'cetriolo', 'sedano', 'finocchio', 'cipolla',
    'cipollotto', 'scalogno', 'aglio', 'porro', 'patata', 'patata dolce', 'fungo', 'champignon', 'asparago', 'carciofo',
    'fagiolino', 'radicchio', 'indivia', 'scarola', 'rapa', 'cime di rapa', 'ravanello', 'barbabietola', 'basilico',
    'prezzemolo', 'rosmarino', 'salvia', 'menta', 'timo', 'zenzero', 'erba cipollina', 'germogli', 'piselli freschi',
  ],
  frigo: [
    'latte', 'yogurt', 'burro', 'panna', 'mozzarella', 'burrata', 'ricotta', 'stracchino', 'crescenza', 'mascarpone',
    'parmigiano', 'grana', 'pecorino', 'gorgonzola', 'provola', 'scamorza', 'fontina', 'asiago', 'emmental', 'feta',
    'philadelphia', 'formaggio', 'formaggino', 'uovo', 'tofu', 'seitan', 'tempeh', 'hummus', 'pasta fresca', 'gnocchi',
    'ravioli', 'pasta sfoglia', 'pasta brisé', 'pasta frolla', 'pasta per pizza', 'lievito di birra', 'kefir', 'skyr',
    'budino', 'burger vegetale', 'polpette vegetali', 'margarina', 'spremuta',
  ],
  pane: [
    'pane', 'pane integrale', 'panino', 'baguette', 'focaccia', 'piadina', 'grissino', 'cracker', 'pan carré',
    'pan bauletto', 'tarallo', 'frisella', 'pangrattato', 'tortilla', 'pane azzimo', 'gallette', 'crostini',
  ],
  colazione: [
    'biscotto', 'fette biscottate', 'cereali', 'muesli', 'fiocchi d\'avena', 'corn flakes', 'marmellata', 'confettura',
    'miele', 'nutella', 'crema spalmabile', 'caffè', 'caffè in capsule', 'tè', 'the', 'camomilla', 'tisana', 'cacao',
    'zucchero', 'dolcificante', 'cioccolato', 'merendina', 'cornetto', 'croissant', 'brioche', 'torta',
    'crostata', 'plumcake', 'pandoro', 'panettone', 'colomba', 'caramella', 'orzo solubile', 'latte di soia',
    'latte di avena', 'latte di mandorla', 'latte di riso', 'bevanda di soia', 'bevanda di avena', 'latte a lunga conservazione',
  ],
  pasta: [
    'pasta', 'pasta integrale', 'spaghetti', 'penne', 'fusilli', 'rigatoni', 'farfalle', 'linguine', 'tagliatelle',
    'lasagne', 'orecchiette', 'paccheri', 'mezze maniche', 'ditalini', 'risoni', 'noodles', 'riso', 'riso basmati',
    'riso integrale', 'farro', 'orzo', 'couscous', 'quinoa', 'bulgur', 'polenta', 'farina', 'semola', 'lievito',
    'fecola', 'amido di mais',
  ],
  conserve: [
    'passata', 'passata di pomodoro', 'pelati', 'polpa di pomodoro', 'concentrato di pomodoro', 'sugo', 'pesto', 'oliva',
    'capperi', 'sottoli', 'sottaceti', 'carciofini', 'funghi sott\'olio', 'giardiniera', 'cetriolini', 'pomodori secchi',
    'noce', 'mandorla', 'nocciola', 'pistacchio', 'arachide', 'anacardo', 'uvetta', 'dattero', 'prugne secche',
    'frutta secca', 'semi di girasole', 'semi di chia', 'fagioli secchi', 'ceci secchi', 'lenticchie secche',
  ],
  scatolame: [
    'fagiolo', 'cece', 'lenticchia', 'legumi', 'mais', 'piselli', 'fagioli in scatola', 'ceci in scatola',
    'lenticchie in scatola', 'piselli in scatola', 'zuppa', 'frutta sciroppata', 'latte di cocco',
  ],
  condimenti: [
    'olio', 'olio extravergine', 'olio di oliva', 'olio di semi', 'aceto', 'aceto balsamico', 'sale', 'sale grosso',
    'pepe', 'origano', 'peperoncino', 'curry', 'paprika', 'cannella', 'noce moscata', 'curcuma', 'zafferano', 'cumino',
    'spezie', 'dado', 'brodo', 'maionese', 'ketchup', 'senape', 'salsa di soia', 'tahina', 'salsa',
  ],
  bevande: [
    'acqua', 'acqua frizzante', 'acqua naturale', 'vino', 'vino rosso', 'vino bianco', 'birra', 'succo', 'succo di frutta',
    'aranciata', 'coca cola', 'cola', 'tè freddo', 'bibita', 'prosecco', 'spumante', 'sciroppo', 'gazzosa', 'chinotto',
    'limonata', 'acqua tonica', 'aperitivo',
  ],
  surgelati: [
    'gelato', 'ghiacciolo', 'ghiaccio', 'pizza', 'pizza surgelata', 'minestrone', 'verdure surgelate', 'spinaci surgelati',
    'piselli surgelati', 'fagiolini surgelati', 'patatine surgelate', 'sofficini', 'frutti di bosco surgelati',
  ],
  casa: [
    'detersivo', 'detersivo piatti', 'detersivo lavatrice', 'ammorbidente', 'candeggina', 'varechina', 'sgrassatore',
    'anticalcare', 'detergente', 'pulisci vetri', 'pastiglie lavastoviglie', 'brillantante', 'sale per lavastoviglie',
    'carta igienica', 'carta da cucina', 'scottex', 'tovaglioli', 'sacchi spazzatura', 'sacchetti', 'pellicola',
    'alluminio', 'carta forno', 'spugna', 'panno per pavimenti', 'guanti', 'pile', 'lampadina', 'fiammiferi', 'accendino', 'insetticida',
    'deodorante per ambienti', 'piatti di carta', 'bicchieri di plastica',
  ],
  igiene: [
    'sapone', 'sapone liquido', 'bagnoschiuma', 'docciaschiuma', 'shampoo', 'balsamo', 'dentifricio', 'spazzolino',
    'filo interdentale', 'collutorio', 'deodorante', 'assorbenti', 'salviette', 'salviettine', 'rasoio', 'schiuma da barba',
    'crema', 'crema solare', 'crema mani', 'cotone', 'cotton fioc', 'fazzoletti', 'pannolini', 'cerotti', 'struccante',
  ],
};
