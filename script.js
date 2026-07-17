(() => {
  var BASE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsdWvigWU2h6_sdXOrNN4ndvKO5qAu1QBDGa3jt1ID2YE3gmJdEueosz146DdH99qv0zmrKcQr-gWP';
  var SHEET_NAMES_URL = BASE_SHEET_URL + '/pubhtml';
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

  function parseSheetCSV(csv, sheetName) {
    csv = csv.replace(/\r\n/g, '\n');
    var lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    var hdrs = csvRow(lines[0]).map(function(h) { return h.trim(); });
    var snIdx = -1, specIdx = -1, defectIdx = -1, modelIdx = -1;
    for (var i = 0; i < hdrs.length; i++) {
      if (hdrs[i] === 'S/N') snIdx = i;
      else if (hdrs[i] === 'Spec') specIdx = i;
      else if (hdrs[i] === 'ตำหนิ') defectIdx = i;
      else if (hdrs[i] === 'อ้างอิง') modelIdx = i;
    }
    if (snIdx < 0) return [];
    var data = [];
    for (var i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var vals = csvRow(lines[i]);
      var sn = (vals[snIdx] || '').trim();
      if (!sn) continue;
      var spec = specIdx >= 0 ? (vals[specIdx] || '').trim() : '';
      var sp = spec.split(',');
      var defect = defectIdx >= 0 ? (vals[defectIdx] || '').trim() : '';
      var model = modelIdx >= 0 ? (vals[modelIdx] || '').trim() : sheetName;
      if (!model) model = sheetName;
      data.push({
        'Serial Number': sn,
        'CPU': (sp[0] || '').trim(),
        'Ram': (sp[1] || '').trim(),
        'Storage': (sp[2] || '').trim(),
        'GPU': '',
        'Model': model,
        'ตำหนิ': defect,
        'LAN MAC Address': '',
        '_sheetName': model
      });
    }
    return data;
  }

  function buildDropdown(sheetNames) {
    var countMap = {};
    allData.forEach(function(r) { var n = r._sheetName || 'Unknown'; countMap[n] = (countMap[n] || 0) + 1; });
    filterSelect.innerHTML = '<option value="all">All Models (' + allData.length + ')</option>';
    sheetNames.sort().forEach(function(name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name + ' (' + (countMap[name] || 0) + ')';
      filterSelect.appendChild(opt);
    });
  }

  function updateProgress(done, total) {
    var pct = Math.round((done / total) * 100);
    loading.innerHTML = '<div class="spinner"></div><p>กำลังโหลด... ' + done + '/' + total + ' sheets</p><div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
  }

  function renderTable() {
    var search = searchInput.value.toLowerCase();
    var filtered = allData;
    if (currentFilter !== 'all') {
      filtered = filtered.filter(function(d) { return d._sheetName === currentFilter; });
    }
    if (search) {
      filtered = filtered.filter(function(d) {
        return d['Serial Number'] && Object.values(d).some(function(v) { return String(v).toLowerCase().indexOf(search) !== -1; });
      });
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
      var defect = row['ตำหนิ'] || '';
      var hasSpec = row['CPU'] || row['Ram'];
      html.push('<tr><td>' + (i + 1) + '</td><td><span class="serial-badge">' + (row['Model'] || '-') + '</span></td><td><span class="serial-badge">' + (row['Serial Number'] || '-') + '</span></td><td>' + (row['CPU'] || '-') + '</td><td><span class="ram-badge">' + (row['Ram'] || '-') + '</span></td><td>' + (row['GPU'] || '-') + '</td><td>' + (row['Storage'] || '-') + '</td><td>' + (row['LAN MAC Address'] || '-') + '</td><td>' + (defect ? '<span class="defect-badge">' + defect + '</span>' : (hasSpec ? '<span style="color:#22c55e">OK</span>')) + '</td></tr>');
    }
    stockTableBody.innerHTML = html.join('');
  }

  async function init() {
    try {
      loading.style.display = '';
      stockTableWrapper.style.display = 'none';
      loading.innerHTML = '<div class="spinner"></div><p>กำลังโหลดรายชื่อ sheets...</p>';

      var manifestResp = await fetch(SHEET_NAMES_URL + '?_=' + Date.now());
      var html = await manifestResp.text();
      var regex = /items\.push\(\{name:\s*"([^"]+)"[^}]*gid:\s*"([^"]+)"/g;
      var match;
      var sheets = [];
      while ((match = regex.exec(html)) !== null) {
        if (match[1] !== 'Total Product' && match[1] !== 'All Stock') {
          sheets.push({ name: match[1], gid: match[2] });
        }
      }

      if (sheets.length === 0) {
        loading.innerHTML = '<p style="color:#f59e0b">ไม่พบ sheets</p>';
        return;
      }

      var total = sheets.length;
      allData = [];
      updateProgress(0, total);

      var batchSize = 20;
      for (var i = 0; i < total; i += batchSize) {
        var batch = sheets.slice(i, i + batchSize);
        var results = await Promise.all(batch.map(function(s) {
          var url = BASE_SHEET_URL + '/pub?output=csv&gid=' + s.gid + '&_=' + Date.now();
          return fetch(url).then(function(r) { return r.ok ? r.text() : ''; }).catch(function() { return ''; });
        }));
        results.forEach(function(csv, idx) {
          if (!csv || csv.length < 10) return;
          var rows = parseSheetCSV(csv, batch[idx].name);
          allData = allData.concat(rows);
        });
        updateProgress(Math.min(i + batchSize, total), total);
      }

      var sheetNames = [];
      var seen = {};
      allData.forEach(function(r) {
        if (r._sheetName && !seen[r._sheetName]) { seen[r._sheetName] = true; sheetNames.push(r._sheetName); }
      });
      buildDropdown(sheetNames);
      filterSelect.addEventListener('change', function() { currentFilter = filterSelect.value; renderTable(); });
      loading.style.display = 'none';
      stockTableWrapper.style.display = '';
      renderTable();
    } catch (err) {
      console.error('Init error:', err);
      loading.innerHTML = '<p style="color:#ef4444">ไม่สามารถโหลดข้อมูลได้</p><p style="color:#a1a1aa;font-size:0.9rem;margin-top:12px">' + err.message + '</p>';
    }
  }

  init();
})();
