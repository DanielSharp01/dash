/**
 * Icons are stored as emoji codepoints, so swapping in one drawn icon set later changes how
 * they render without touching saved data. Names drive search and the suggestion from a name.
 */
export interface IconDef {
  icon: string;
  names: string[];
}

export type IconGroup = "food" | "drink" | "activity";

export const iconGroups: Record<IconGroup, { label: string; icons: IconDef[] }> = {
  food: {
    label: "Food",
    icons: [
      { icon: "🍎", names: ["apple"] },
      { icon: "🍐", names: ["pear"] },
      { icon: "🍊", names: ["orange", "mandarin", "clementine"] },
      { icon: "🍋", names: ["lemon", "lime"] },
      { icon: "🍌", names: ["banana"] },
      { icon: "🍉", names: ["watermelon", "melon"] },
      { icon: "🍇", names: ["grape", "raisin"] },
      { icon: "🍓", names: ["strawberry", "berry", "berries"] },
      { icon: "🫐", names: ["blueberry", "blueberries"] },
      { icon: "🍒", names: ["cherry", "cherries"] },
      { icon: "🍑", names: ["peach", "apricot"] },
      { icon: "🍍", names: ["pineapple"] },
      { icon: "🥝", names: ["kiwi"] },
      { icon: "🥑", names: ["avocado", "guacamole"] },
      { icon: "🍅", names: ["tomato"] },
      { icon: "🥕", names: ["carrot"] },
      { icon: "🌽", names: ["corn", "maize"] },
      { icon: "🥦", names: ["broccoli", "vegetable", "veg"] },
      { icon: "🥬", names: ["lettuce", "spinach", "cabbage", "kale"] },
      { icon: "🥒", names: ["cucumber", "pickle", "zucchini"] },
      { icon: "🫑", names: ["pepper", "paprika"] },
      { icon: "🧅", names: ["onion"] },
      { icon: "🧄", names: ["garlic"] },
      { icon: "🍄", names: ["mushroom"] },
      { icon: "🥔", names: ["potato", "potatoes"] },
      { icon: "🍠", names: ["sweet potato", "yam"] },
      { icon: "🫘", names: ["beans", "lentils", "chickpeas"] },
      { icon: "🥜", names: ["peanut", "nut", "nuts", "almond"] },
      { icon: "🌰", names: ["chestnut", "walnut", "hazelnut"] },
      { icon: "🍞", names: ["bread", "toast", "loaf"] },
      { icon: "🥐", names: ["croissant", "pastry"] },
      { icon: "🥖", names: ["baguette"] },
      { icon: "🥯", names: ["bagel"] },
      { icon: "🥨", names: ["pretzel"] },
      { icon: "🥞", names: ["pancake", "crepe", "palacsinta"] },
      { icon: "🧇", names: ["waffle"] },
      { icon: "🥣", names: ["cereal", "muesli", "granola", "oats", "porridge", "oatmeal"] },
      { icon: "🍚", names: ["rice"] },
      { icon: "🍝", names: ["pasta", "spaghetti", "noodles", "macaroni"] },
      { icon: "🍜", names: ["ramen", "noodle soup", "pho"] },
      { icon: "🍲", names: ["stew", "soup", "goulash", "chili", "curry", "pot"] },
      { icon: "🍛", names: ["curry rice"] },
      { icon: "🥗", names: ["salad"] },
      { icon: "🥚", names: ["egg", "eggs", "omelette"] },
      { icon: "🍳", names: ["fried egg", "fry"] },
      { icon: "🧀", names: ["cheese", "mozzarella", "cheddar", "cottage"] },
      { icon: "🧈", names: ["butter", "margarine"] },
      { icon: "🍗", names: ["chicken", "turkey", "drumstick"] },
      { icon: "🍖", names: ["meat", "pork", "ribs"] },
      { icon: "🥩", names: ["steak", "beef", "mince"] },
      { icon: "🥓", names: ["bacon", "ham"] },
      { icon: "🌭", names: ["sausage", "hot dog", "frankfurter"] },
      { icon: "🐟", names: ["fish", "salmon", "tuna", "cod"] },
      { icon: "🦐", names: ["shrimp", "prawn", "seafood"] },
      { icon: "🍣", names: ["sushi"] },
      { icon: "🍔", names: ["burger", "hamburger"] },
      { icon: "🍟", names: ["fries", "chips"] },
      { icon: "🍕", names: ["pizza"] },
      { icon: "🌮", names: ["taco"] },
      { icon: "🌯", names: ["wrap", "burrito", "kebab", "gyros"] },
      { icon: "🥪", names: ["sandwich"] },
      { icon: "🥟", names: ["dumpling"] },
      { icon: "🍱", names: ["lunch", "bento", "meal", "combo"] },
      { icon: "🥛", names: ["yoghurt", "yogurt", "kefir", "quark", "skyr"] },
      { icon: "🍫", names: ["chocolate", "bar", "protein bar"] },
      { icon: "🍬", names: ["candy", "sweets"] },
      { icon: "🍪", names: ["cookie", "biscuit"] },
      { icon: "🍰", names: ["cake"] },
      { icon: "🧁", names: ["muffin", "cupcake"] },
      { icon: "🍩", names: ["donut", "doughnut"] },
      { icon: "🍦", names: ["ice cream", "gelato"] },
      { icon: "🍯", names: ["honey", "jam", "syrup"] },
      { icon: "🫒", names: ["olive", "oil"] },
      { icon: "🧂", names: ["salt", "spice", "seasoning"] },
      { icon: "🍿", names: ["popcorn", "snack"] },
      { icon: "🥫", names: ["can", "tin", "sauce", "ketchup"] },
      { icon: "🍽️", names: ["food", "dish"] },
    ],
  },
  drink: {
    label: "Drinks",
    icons: [
      { icon: "💧", names: ["water"] },
      { icon: "🫗", names: ["sparkling", "mineral water"] },
      { icon: "☕", names: ["coffee", "espresso", "latte", "cappuccino", "americano"] },
      { icon: "🍵", names: ["tea", "matcha", "herbal"] },
      { icon: "🫖", names: ["teapot", "infusion"] },
      { icon: "🥛", names: ["milk", "oat milk", "soy milk", "almond milk", "plant milk"] },
      { icon: "🧃", names: ["juice", "orange juice", "apple juice"] },
      { icon: "🥤", names: ["soda", "cola", "coke", "soft drink", "lemonade", "smoothie", "shake", "protein shake"] },
      { icon: "🧋", names: ["bubble tea", "iced coffee", "frappe"] },
      { icon: "🧉", names: ["mate"] },
      { icon: "🍺", names: ["beer", "lager", "ale"] },
      { icon: "🍷", names: ["wine", "red wine"] },
      { icon: "🥂", names: ["champagne", "prosecco", "white wine", "fröccs"] },
      { icon: "🍸", names: ["cocktail", "gin", "martini"] },
      { icon: "🥃", names: ["whisky", "whiskey", "spirit", "pálinka", "rum", "vodka"] },
      { icon: "⚡", names: ["energy drink", "energy"] },
    ],
  },
  activity: {
    label: "Activities",
    icons: [
      { icon: "🚶", names: ["walk", "walking"] },
      { icon: "🏃", names: ["run", "running", "jog"] },
      { icon: "🚴", names: ["cycle", "cycling", "bike"] },
      { icon: "🏊", names: ["swim", "swimming"] },
      { icon: "🏋️", names: ["weights", "lifting", "gym", "strength"] },
      { icon: "💪", names: ["push-ups", "pushups", "arms"] },
      { icon: "🦵", names: ["squats", "legs"] },
      { icon: "🤸", names: ["burpees", "gymnastics", "pilates"] },
      { icon: "🧘", names: ["yoga", "meditation"] },
      { icon: "🙆", names: ["stretch", "stretching", "mobility"] },
      { icon: "🥾", names: ["hike", "hiking"] },
      { icon: "🚣", names: ["row", "rowing"] },
      { icon: "🛶", names: ["canoe", "kayak", "paddle"] },
      { icon: "🧗", names: ["climb", "climbing", "pull-ups", "bouldering"] },
      { icon: "🪜", names: ["stairs"] },
      { icon: "⏱️", names: ["hiit", "interval", "timer"] },
      { icon: "⚙️", names: ["elliptical", "machine"] },
      { icon: "🎾", names: ["tennis", "padel"] },
      { icon: "🏸", names: ["badminton"] },
      { icon: "🏓", names: ["table tennis", "ping pong"] },
      { icon: "⚽", names: ["football", "soccer"] },
      { icon: "🏀", names: ["basketball"] },
      { icon: "🏐", names: ["volleyball"] },
      { icon: "🥊", names: ["boxing", "martial arts"] },
      { icon: "💃", names: ["dance", "dancing", "zumba"] },
      { icon: "⛸️", names: ["skate", "skating"] },
      { icon: "⛷️", names: ["ski", "skiing"] },
      { icon: "🏄", names: ["surf", "surfing"] },
      { icon: "🐕", names: ["dog", "dog walk"] },
      { icon: "🧹", names: ["cleaning", "housework", "chores"] },
    ],
  },
};

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The icon whose name best matches the words of a name: a whole-name match beats a single word. */
export function suggestIcon(name: string, groups: IconGroup[]): string | undefined {
  const text = name.trim().toLowerCase();
  if (!text) return undefined;
  const tokens = words(text);
  let best: { icon: string; score: number } | undefined;
  for (const g of groups)
    for (const def of iconGroups[g].icons)
      for (const n of def.names) {
        const score = text === n ? 3 : text.includes(n) && n.includes(" ") ? 2 : tokens.includes(n) || tokens.some((t) => t.length > 3 && n.startsWith(t)) ? 1 : 0;
        if (score > (best?.score ?? 0)) best = { icon: def.icon, score };
      }
  return best?.icon;
}

export function searchIcons(query: string, groups: IconGroup[]): IconDef[] {
  const q = query.trim().toLowerCase();
  const all = groups.flatMap((g) => iconGroups[g].icons);
  return q ? all.filter((d) => d.names.some((n) => n.includes(q))) : all;
}
