(() => {
  var BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsdWvigWU2h6_sdXOrNN4ndvKO5qAu1QBDGa3jt1ID2YE3gmJdEueosz146DdH99qv0zmrKcQr-gWP';
  var PUB_HTML_URL = BASE_URL + '/pubhtml';
  var ALL_STOCK_GID = '1658173385';
  var CACHE_KEY = 'stock_cache_v3';
  var CACHE_TTL = 5 * 60 * 1000;

  var allData = [];
  var currentFilter = 'all';

  var navbar = document.getElementById('navbar');
  var mobileToggle = document.getElementById('mobileToggle');
  var navLinks = document.querySelector('.nav-links');
  var loading = document.getElementById('loading');
  var stockTableWrapper = document.getElementById('stockTableWrapper');
  var stockTableBody = document.getElementById('stockTableBody');
  var searchInput = document.getElementById('searchInput');
  var noResults = document.getElementById('noResults');
  var filterSelect = document.getElementById('filterSelect');
  var menuOpen = false;

  window.addEventListener('scroll', function() {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  });

  mobileToggle.addEventListener('click', function() {
    menuOpen = !menuOpen;
    if (menuOpen) {
      navLinks.style.display = 'flex';
      navLinks.style.flexDirection = 'column';
      navLinks.style.position = 'absolute';
      navLinks.style.top = '100%';
      navLinks.style.left = '0';
      navLinks.style.right = '0';
      navLinks.style.background = 'rgba(9,9,11,0.95)';
      navLinks.style.padding = '24px';
      navLinks.style.gap = '16px';
      navLinks.style.borderBottom = '1px solid #27272a';
    } else {
      navLinks.removeAttribute('style');
    }
  });

  document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      var target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
        if (menuOpen) { menuOpen = false; navLinks.removeAttribute('style'); }
      }
    });
  });

  searchInput.addEventListener('input', function() { renderTable(); });

  function stripBOM(s) { return s.charCodeAt(0) === 0xFEFF ? s.substring(1) : s; }

  function csvRow(line) {
    var values = [];
    var current = '';
    var inQ = false;
    for (var c = 0; c < line.length; c++) {
      var ch = line[c];
      if (inQ) {
        if (ch === '"') {
          if (c + 1 < line.length && line[c + 1] === '"') { current += '"'; c++; }
          else { inQ = false; }
        } else { current += ch; }
      } else {
        if (ch === '"') { inQ = true; }
        else if (ch === ',') { values.push(current); current = ''; }
        else { current += ch; }
      }
    }
    values.push(current);
    return values;
  }

  function parseAllStockCSV(text) {
    text = stripBOM(text).replace(/\r\n/g, '\n');
    var lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    var hdrs = csvRow(lines[0]).map(function(h) { return h.trim(); });
    if (hdrs.length < 3) return [];
    var hasSN = false;
    for (var i = 0; i < hdrs.length; i++) {
      if (hdrs[i] === 'S/N') { hasSN = true; break; }
    }
    if (!hasSN) return [];
    var modelIdx = -1;
    for (var i = 0; i < hdrs.length; i++) {
      if (hdrs[i] === 'อ้างอิง') { modelIdx = i; break; }
    }
    var snIdx = hdrs.indexOf('S/N');
    var specIdx = hdrs.indexOf('Spec');
    var defectIdx = hdrs.indexOf('ตำหนิ');
    var data = [];
    for (var i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var vals = csvRow(lines[i]);
      var sn = (vals[snIdx] || '').trim();
      if (!sn) continue;
      var spec = (vals[specIdx] || '').trim();
      var specParts = spec.split(',');
      var defect = defectIdx >= 0 ? (vals[defectIdx] || '').trim() : '';
      var model = modelIdx >= 0 ? (vals[modelIdx] || '').trim() : '';
      data.push({
        'Serial Number': sn,
        'Spec': spec,
        'CPU': (specParts[0] || '').trim(),
        'Ram': (specParts[1] || '').trim(),
        'Storage': (specParts[2] || '').trim(),
        'GPU': '',
        'Model': model,
        'ตำหนิ': defect,
        'LAN MAC Address': '',
        'LAN MAC Address + Wi-Fi': '',
        '_sheetName': model
      });
    }
    return data;
  }

  function parseCSV(text) {
    text = stripBOM(text).replace(/\r\n/g, '\n');
    var lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    var hdrs = csvRow(lines[0]).map(function(h) { return h.trim(); });
    var format = 'hp';
    var hpHeaders = ['No.', 'S/N', 'Spec', 'Quotation No.', 'Date Start', 'Expire Date', 'Company', 'ตำหนิ', 'อ้างอิง'];
    var useHP = false;
    for (var i = 0; i < hdrs.length; i++) {
      if (hdrs[i] === 'S/N') { useHP = true; break; }
    }
    if (!useHP && hdrs.length === 12) { format = 'dell'; }
    var data = [];
    for (var i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var vals = csvRow(lines[i]);
      var row = {};
      for (var h = 0; h < hpHeaders.length; h++) {
        row[hpHeaders[h]] = (vals[h] || '').trim();
      }
      if (format === 'hp' || useHP) {
        var spec = row['Spec'] || '';
        var sp = spec.split(',');
        row['Serial Number'] = row['S/N'] || '';
        row['CPU'] = (sp[0] || '').trim();
        row['Ram'] = (sp[1] || '').trim();
        row['Storage'] = (sp[2] || '').trim();
        row['GPU'] = '';
        row['Model'] = row['อ้างอิง'] || '';
        row['LAN MAC Address'] = '';
        row['LAN MAC Address + Wi-Fi'] = '';
        if (!row['ตำหนิ']) row['ตำหนิ'] = '';
      } else {
        for (var h = 0; h < hdrs.length; h++) {
          row[hdrs[h]] = (vals[h] || '').trim();
        }
        if (row['LAN MAC Address + Wi-Fi']) {
          var parts = row['LAN MAC Address + Wi-Fi'].split('|');
          row['LAN MAC Address'] = (parts[0] || '').replace('LAN: ', '').trim();
        }
      }
      data.push(row);
    }
    return data;
  }

  async function fetchAllStock() {
    var url = BASE_URL + '/pub?output=csv&gid=' + ALL_STOCK_GID + '&_t=' + Date.now();
    var resp = await fetch(url);
    if (!resp.ok) return [];
    var csv = await resp.text();
    if (!csv.trim() || csv.trim().length < 10) return [];
    return parseAllStockCSV(csv);
  }

  async function discoverSheets() {
    var resp = await fetch(PUB_HTML_URL + '?_=' + Date.now());
    var html = await resp.text();
    var sheets = [];
    var regex = /items\.push\(\{name:\s*"([^"]+)"[^}]*gid:\s*"([^"]+)"/g;
    var match;
    while ((match = regex.exec(html)) !== null) {
      if (match[1] !== 'Total Product' && match[1] !== 'All Stock') {
        sheets.push({ name: match[1], gid: match[2] });
      }
    }
    return sheets;
  }

  async function fetchSheetCSV(sheet) {
    var url = BASE_URL + '/pub?output=csv&gid=' + sheet.gid + '&_t=' + Date.now();
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var csv = await resp.text();
    var rows = parseCSV(csv);
    rows.forEach(function(r) { r._sheetName = sheet.name; r['Model'] = sheet.name; });
    return rows;
  }

  function buildDropdown(sheetNames) {
    filterSelect.innerHTML = '<option value="all">All Models (' + allData.length + ')</option>';
    var countMap = {};
    allData.forEach(function(r) { var n = r._sheetName || 'Unknown'; countMap[n] = (countMap[n] || 0) + 1; });
    sheetNames.sort().forEach(function(name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name + ' (' + (countMap[name] || 0) + ')';
      filterSelect.appendChild(opt);
    });
  }

  function updateProgress(done, total) {
    var pct = Math.round((done / total) * 100);
    loading.innerHTML =
      '<div class="spinner"></div>' +
      '<p>กำลังโหลด... ' + done + '/' + total + '</p>' +
      '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
  }

  function getCached() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var cache = JSON.parse(raw);
      if (Date.now() - cache.ts > CACHE_TTL) return null;
      return cache.data;
    } catch (e) { return null; }
  }

  function setCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) {}
  }

  async function loadAllStock() {
    var rows = await fetchAllStock();
    if (rows.length === 0) return null;
    var sheetNames = [];
    var seen = {};
    rows.forEach(function(r) {
      if (r._sheetName && !seen[r._sheetName]) { seen[r._sheetName] = true; sheetNames.push(r._sheetName); }
    });
    return { rows: rows, sheetNames: sheetNames };
  }

  async function loadBatch() {
    var sheets = await discoverSheets();
    if (sheets.length === 0) return null;
    var total = sheets.length;
    allData = [];
    updateProgress(0, total);
    var batchSize = 30;
    for (var i = 0; i < total; i += batchSize) {
      var batch = sheets.slice(i, i + batchSize);
      var results = await Promise.all(batch.map(function(s) {
        return fetchSheetCSV(s).catch(function() { return []; });
      }));
      results.forEach(function(rows) {
        var withSN = rows.filter(function(r) { return r['Serial Number'] && r['Serial Number'].trim(); });
        allData = allData.concat(withSN);
      });
      updateProgress(Math.min(i + batchSize, total), total);
    }
    var sheetNames = [];
    var seen = {};
    allData.forEach(function(r) {
      if (r._sheetName && !seen[r._sheetName]) { seen[r._sheetName] = true; sheetNames.push(r._sheetName); }
    });
    return { rows: allData, sheetNames: sheetNames };
  }

  function renderTable() {
    var search = searchInput.value.toLowerCase();
    var filtered = allData;
    if (currentFilter !== 'all') {
      filtered = filtered.filter(function(d) { return d._sheetName === currentFilter; });
    }
    if (search) {
      filtered = filtered.filter(function(d) {
        return d['Serial Number'] && d['Serial Number'].trim() && Object.values(d).some(function(v) { return String(v).toLowerCase().indexOf(search) !== -1; });
      });
    } else {
      filtered = filtered.filter(function(d) { return d['Serial Number'] && d['Serial Number'].trim(); });
    }
    if (filtered.length === 0) {
      stockTableWrapper.style.display = 'none';
      noResults.style.display = '';
      return;
    }
    noResults.style.display = 'none';
    stockTableWrapper.style.display = '';
    var html = [];
    for (var i = 0; i < filtered.length; i++) {
      var row = filtered[i];
      var mac = row['LAN MAC Address'] || (row['LAN MAC Address + Wi-Fi'] || '').split('|')[0].replace('LAN: ', '').trim();
      var defect = row['ตำหนิ'] || '';
      var hasSpec = row['CPU'] || row['Ram'];
      html.push('<tr><td>' + (i + 1) + '</td><td><span class="serial-badge">' + (row['Model'] || '-') + '</span></td><td><span class="serial-badge">' + (row['Serial Number'] || '-') + '</span></td><td>' + (row['CPU'] || '-') + '</td><td><span class="ram-badge">' + (row['Ram'] || '-') + '</span></td><td>' + (row['GPU'] || '-') + '</td><td>' + (row['Storage'] || '-') + '</td><td>' + (mac || '-') + '</td><td>' + (defect ? '<span class="defect-badge">' + defect + '</span>' : (hasSpec ? '<span style="color:#22c55e">OK</span>' : '<span style="color:#a1a1aa">-</span>')) + '</td></tr>');
    }
    stockTableBody.innerHTML = html.join('');
  }

  async function init() {
    try {
      loading.style.display = '';
      stockTableWrapper.style.display = 'none';

      var cached = getCached();
      if (cached) {
        allData = cached.rows;
        buildDropdown(cached.sheetNames);
        loading.style.display = 'none';
        stockTableWrapper.style.display = '';
        filterSelect.addEventListener('change', function() { currentFilter = filterSelect.value; renderTable(); });
        renderTable();
        return;
      }

      loading.innerHTML = '<div class="spinner"></div><p>กำลังโหลดข้อมูล...</p>';

      var result = await loadAllStock();

      if (result && result.rows.length > 0) {
        allData = result.rows;
        buildDropdown(result.sheetNames);
        setCache(result);
      } else {
        result = await loadBatch();
        if (result) {
          allData = result.rows;
          buildDropdown(result.sheetNames);
          setCache(result);
        }
      }

      filterSelect.addEventListener('change', function() { currentFilter = filterSelect.value; renderTable(); });
      loading.style.display = 'none';
      stockTableWrapper.style.display = '';
      renderTable();
    } catch (err) {
      console.error('Init error:', err);
      loading.innerHTML = '<p style="color:#ef4444">ไม่สามารถโหลดข้อมูลได้</p><p style="color:#a1a1aa;font-size:0.9rem;margin-top:12px">ตรวจสอบว่ารันผ่าน HTTP Server</p>';
    }
  }

  init();
})();
