// --- CONFIG ---
const DEFAULT_SHEET_JSONP = "https://docs.google.com/spreadsheets/d/1igtQX_K3H24gSYxyh6zeridz4pbYVRTCJYTpCdCRnF4/gviz/tq?tqx=out:json&tq&callback=window.handleJsonp";
let SHEET_JSONP = localStorage.getItem('custom_sheet_url') || DEFAULT_SHEET_JSONP;

// --- STATE ---
window.allData = []; // Make it globally accessible

// --- DATA FETCHING ---
function loadData(callback) {
    // Google Shim
    window.google = { visualization: { Query: { setResponse: (json) => handleJsonp(json, callback) } } };

    const script = document.createElement('script');
    script.src = SHEET_JSONP;
    script.onerror = () => {
        console.error("Data Load Failed");
        if (callback) callback(null);
    };
    document.body.appendChild(script);
}

function handleJsonp(json, callback) {
    if (!json || !json.table || !json.table.rows) {
        if (callback) callback(null);
        return;
    }

    // --- Dynamic Mapping Logic ---
    const cols = json.table.cols;
    const colMap = {};
    cols.forEach((c, i) => { if (c && c.label) colMap[c.label.toLowerCase().trim()] = i; });
    const getIdx = (...ns) => { for (let n of ns) if (colMap[n] !== undefined) return colMap[n]; return -1; };

    const idx = {
        // More robust mapping with synonyms
        region: getIdx('region', '地區', '區域', 'area', '地域'),
        name: getIdx('name', '店名', '店家名稱', 'title', '店鋪', '名稱'),
        cat: getIdx('category', '種類', '分類', 'type', 'class'),
        price: getIdx('price', '預算', 'cost'),
        must: getIdx('must_order', 'must', '推薦菜色', '必點', 'recommend'),
        desc: getIdx('description', 'desc', '介紹', '心得', 'note', 'content'),
        addr1: getIdx('address', '地址', 'address', '店址', '住址', '住所', '地點', '位置', 'location', 'addr'),
        addr2: getIdx('map', 'map code', 'mapcode', 'google map', '地圖'),
        link: getIdx('gmap_link', 'link', '連結', 'url', 'website'),
        lat: getIdx('lat', 'latitude', '緯度'),
        lng: getIdx('lng', 'longitude', '經度'),
        img: getIdx('image', 'img', '照片', '圖片', 'pic', 'photo')   // New Image Column
    };

    let uidCounter = 0; // Unique ID Generator

    const data = json.table.rows.map(row => {
        const c = row.c;
        if (!c) return null;
        const v = (i) => (i !== -1 && c[i]) ? (c[i].f || c[i].v) : '';
        const getNum = (i) => {
            if (i !== -1 && c[i] && c[i].v !== null) {
                const val = parseFloat(c[i].v);
                return isNaN(val) ? null : val;
            }
            return null;
        };

        // Address Fallback Logic
        let rawAddr1 = v(idx.addr1);
        let rawAddr2 = v(idx.addr2); // Map column

        let displayAddr = rawAddr1;
        let displayLink = v(idx.link);

        // Smart handling of Map Column (addr2)
        if (rawAddr2) {
            if (rawAddr2.startsWith('http')) {
                // It's a URL -> Use as Link fallback
                if (!displayLink) displayLink = rawAddr2;
            } else {
                // It's text -> Use as Address fallback
                if (!displayAddr) displayAddr = rawAddr2;
            }
        }

        // 2. Try Explicit Columns (J=9, L=11)
        // Note: Sheet columns are 0-indexed in array. 
        // J is 9th index (A=0...J=9)
        // L is 11th index
        let lat = getNum(c[9]) || getNum(c[10]) || getNum(c[12]);
        let lng = getNum(c[11]) || getNum(c[12]) || getNum(c[13]);

        // 2. Scan Link & Address/Map Column for URL Coords
        if (lat === null || lng === null) {
            // Check Link, then Map column, then Name (rare but possible)
            const targets = [displayLink, rawAddr2, rawAddr1];
            for (const url of targets) {
                if (!url) continue;
                // Regex @lat,lng
                const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (atMatch) { lat = parseFloat(atMatch[1]); lng = parseFloat(atMatch[2]); break; }
                // Regex q=lat,lng
                const qMatch = url.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (qMatch) { lat = parseFloat(qMatch[1]); lng = parseFloat(qMatch[2]); break; }
                // Regex 3d...4d...
                const dataMatch = url.match(/3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                if (dataMatch) { lat = parseFloat(dataMatch[1]); lng = parseFloat(dataMatch[2]); break; }
            }
        }

        // 3. String Scan "Lat,Lng" in ANY cell
        if (lat === null || lng === null) {
            c.forEach(cell => {
                if (cell && cell.v !== null) {
                    const str = String(cell.v);
                    // Look for "26.123, 127.456" pattern (space tolerant)
                    const commaMatch = str.match(/(\d{2,3}\.\d+)[,\s]+(\d{3}\.\d+)/);
                    if (commaMatch) {
                        const latC = parseFloat(commaMatch[1]);
                        const lngC = parseFloat(commaMatch[2]);
                        // Validate roughly Okinawa box
                        if (latC > 24 && latC < 28 && lngC > 126 && lngC < 130) {
                            lat = latC;
                            lng = lngC;
                        }
                    }
                }
            });
        }

        // 4. Single Number Heuristic (Old fallback)
        if (lat === null || lng === null) {
            c.forEach(cell => {
                if (cell && typeof cell.v === 'number') {
                    if (cell.v > 24 && cell.v < 28) lat = cell.v;
                    if (cell.v > 126 && cell.v < 130) lng = cell.v;
                }
            });
        }

        // Get Image
        let img = v(idx.img);
        // If not found by header name, try explicit column 11 if it's a string URL
        if (!img && c[11] && c[11].v && typeof c[11].v === 'string' && c[11].v.startsWith('http')) {
            img = String(c[11].v);
        }

        // Double check it looks like a URL
        // Ignore Google Search URLs (User pasted search page instead of image)
        if (img && (!img.startsWith('http') || img.includes('google.com/search'))) {
            img = null;
        }

        if (!v(idx.name)) return null;

        return {
            region: v(idx.region),
            name: v(idx.name),
            category: v(idx.cat) || "其他", // Ensure string
            price: v(idx.price),
            must: v(idx.must),
            desc: v(idx.desc) || displayAddr, // Fallback desc to addr
            addr: displayAddr,
            link: displayLink,
            img: img,
            lat, lng,
            _uid: `item-${uidCounter++}`, // Assign UI ID
            _favKey: `${v(idx.name)}|${v(idx.region)}` // Persistent Key
        };
    }).filter(x => x);

    window.allData = data;

    if (callback) callback(data);
}

function getFallbackImage(category) {
    const cat = (category || "").toLowerCase();

    // High Quality Public Domain Images (Wikimedia Commons)
    const images = {
        ramen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Shoyu_Ramen.jpg/800px-Shoyu_Ramen.jpg',
        bbq: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Yakiniku_meat_by_jscash_in_Osaka.jpg/800px-Yakiniku_meat_by_jscash_in_Osaka.jpg',
        sushi: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Sushi_platter.jpg/800px-Sushi_platter.jpg',
        dessert: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Matcha_cake%2C_white_chocolate_ice_cream_and_berries_2.jpg/800px-Matcha_cake%2C_white_chocolate_ice_cream_and_berries_2.jpg',
        burger: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/RedDot_Burger_Shed.jpg/800px-RedDot_Burger_Shed.jpg',
        pizza: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Eq_it-na_pizza-margherita_sep2005_sml.jpg/800px-Eq_it-na_pizza-margherita_sep2005_sml.jpg',
        hotel: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Hotel_room_Renaissance_Columbus_Ohio.jpg/800px-Hotel_room_Renaissance_Columbus_Ohio.jpg',
        sightseeing: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Shuri_Castle_Seiden_201708.jpg/800px-Shuri_Castle_Seiden_201708.jpg',
        alcohol: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Kirin_beer.jpg/800px-Kirin_beer.jpg',
        default: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Good_Food_Display_-_NCI_Visuals_Online.jpg/800px-Good_Food_Display_-_NCI_Visuals_Online.jpg'
    };

    if (cat.includes('拉麵') || cat.includes('麵')) return images.ramen;
    if (cat.includes('燒肉') || cat.includes('牛排')) return images.bbq;
    if (cat.includes('海鮮') || cat.includes('魚') || cat.includes('壽司')) return images.sushi;
    if (cat.includes('甜點') || cat.includes('咖啡') || cat.includes('冰') || cat.includes('鬆餅')) return images.dessert;
    if (cat.includes('漢堡')) return images.burger;
    if (cat.includes('披薩')) return images.pizza;
    if (cat.includes('披薩')) return images.pizza;
    if (cat.includes('飯店') || cat.includes('住宿') || cat.includes('hotel')) return images.hotel;
    if (cat.includes('景點') || cat.includes('觀光') || cat.includes('sightseeing')) return images.sightseeing;
    if (cat.includes('酒') || cat.includes('居酒屋')) return images.alcohol;

    return images.default;
}

function getCategoryIcon(category) {
    const cat = (category || "").toLowerCase();
    if (cat.includes('拉麵') || cat.includes('麵')) return 'fa-bowl-rice';
    if (cat.includes('燒肉') || cat.includes('牛排') || cat.includes('肉')) return 'fa-fire';
    if (cat.includes('海鮮') || cat.includes('魚') || cat.includes('壽司')) return 'fa-fish';
    if (cat.includes('甜點') || cat.includes('咖啡') || cat.includes('冰') || cat.includes('鬆餅')) return 'fa-mug-hot';
    if (cat.includes('酒') || cat.includes('居酒屋')) return 'fa-wine-glass';
    if (cat.includes('漢堡') || cat.includes('burger')) return 'fa-burger';
    if (cat.includes('飯糰') || cat.includes('米')) return 'fa-rice-cracker';
    if (cat.includes('披薩') || cat.includes('pizza')) return 'fa-pizza-slice';
    if (cat.includes('披薩') || cat.includes('pizza')) return 'fa-pizza-slice';
    if (cat.includes('飯店') || cat.includes('住宿') || cat.includes('hotel')) return 'fa-bed';
    if (cat.includes('景點') || cat.includes('觀光') || cat.includes('sightseeing')) return 'fa-camera';

    return 'fa-utensils'; // Default
}
