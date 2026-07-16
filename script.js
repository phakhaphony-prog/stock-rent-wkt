(() => {
  var BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsdWvigWU2h6_sdXOrNN4ndvKO5qAu1QBDGa3jt1ID2YE3gmJdEueosz146DdH99qv0zmrKcQr-gWP';
  var PUB_HTML_URL = BASE_URL + '/pubhtml';

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

  function parseCSV(text) {
    var lines = text.trim().split('\n');
    var rawHeaders = lines[0].split(',');
    var headerCount = rawHeaders.length;

    var headers;
    var format = 'dell';
    if (rawHeaders[1] && rawHeaders[1].trim() === 'S/N') {
      headers = rawHeaders.map(function(h) { return h.trim(); });
      format = 'hp';
    } else if (headerCount === 12) {
      headers = ['Timestamp','Owner','Computer Name','Manufacturer','Model','Serial Number','CPU','Ram','GPU','Storage','LAN MAC Address + Wi-Fi','ตำหนิ'];
      format = 'dell';
    } else {
      headers = rawHeaders.map(function(h) { return h.trim(); });
    }

    var data = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) continue;

      var values = [];
      var current = '';
      var inQuotes = false;
      for (var c = 0; c < line.length; c++) {
        var ch = line[c];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
        else { current += ch; }
      }
      values.push(current.trim());

      if (values.length < 3) continue;

      var row = {};
      for (var h = 0; h < headers.length; h++) {
        row[headers[h]] = values[h] || '';
      }

      if (format === 'hp') {
        var spec = row['Spec'] || '';
        var specParts = spec.split(',');
        var cpu = (specParts[0] || '').trim();
        var ram = (specParts[1] || '').trim();
        var storage = (specParts[2] || '').trim();
        row['Serial Number'] = row['S/N'] || '';
        row['CPU'] = cpu;
        row['Ram'] = ram;
        row['Storage'] = storage;
        row['GPU'] = '';
        row['Model'] = '';
        row['LAN MAC Address'] = '';
        if (!row['ตำหนิ']) row['ตำหนิ'] = '';
      }

      if (format === 'dell' && headerCount === 12 && row['LAN MAC Address + Wi-Fi']) {
        var combined = row['LAN MAC Address + Wi-Fi'];
        var parts = combined.split('|');
        row['LAN MAC Address'] = (parts[0] || '').replace('LAN: ', '').trim();
        row['Wi-Fi MAC Address'] = (parts[1] || '').replace('Wi-Fi:', '').trim();
      }

      data.push(row);
    }
    return data;
  }

  async function discoverSheets() {
    var resp = await fetch(PUB_HTML_URL + '?_=' + Date.now());
    var html = await resp.text();
    var sheets = [];
    var regex = /items\.push\(\{name:\s*"([^"]+)"[^}]*gid:\s*"([^"]+)"/g;
    var match;
    while ((match = regex.exec(html)) !== null) {
      sheets.push({ name: match[1], gid: match[2] });
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

  function buildFilterButtons(sheetNames) {
    var container = document.querySelector('.filter-buttons');
    if (!container) return;
    container.innerHTML = '<button class="filter-btn active" data-filter="all">All (' + allData.length + ')</button>';
    sheetNames.forEach(function(name) {
      var count = allData.filter(function(d) { return d._sheetName === name; }).length;
      var btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.dataset.filter = name;
      btn.textContent = name + ' (' + count + ')';
      container.appendChild(btn);
    });
    container.querySelectorAll('.filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderTable();
      });
    });
  }

  async function fetchAllData() {
    try {
      loading.style.display = '';
      stockTableWrapper.style.display = 'none';
      noResults.style.display = 'none';

      var sheets = await discoverSheets();
      if (sheets.length === 0) throw new Error('No sheets found');

      var results = await Promise.all(sheets.map(function(s) { return fetchSheetCSV(s); }));
      allData = results.flat();

      var sheetNames = sheets.map(function(s) { return s.name; });

      document.getElementById('totalCount').textContent = allData.length;
      var statsHtml = '<div class="stat"><span class="stat-number">' + allData.length + '</span><span class="stat-label">Total PCs</span></div>';
      sheetNames.forEach(function(name) {
        var count = allData.filter(function(d) { return d._sheetName === name; }).length;
        statsHtml += '<div class="stat"><span class="stat-number">' + count + '</span><span class="stat-label">' + name + '</span></div>';
      });
      document.querySelector('.hero-stats').innerHTML = statsHtml;

      buildFilterButtons(sheetNames);
      renderTable();
      loading.style.display = 'none';
      stockTableWrapper.style.display = '';
    } catch (err) {
      console.error('Fetch error:', err);
      loading.innerHTML = '<p style="color:#ef4444">ไม่สามารถโหลดข้อมูลได้</p><p style="color:#a1a1aa;font-size:0.9rem;margin-top:12px">ตรวจสอบว่ารันผ่าน HTTP Server (ไม่ใช่ file://)</p>';
    }
  }

  function renderTable() {
    var search = searchInput.value.toLowerCase();
    var filtered = allData;

    if (currentFilter !== 'all') {
      filtered = filtered.filter(function(d) { return d._sheetName === currentFilter; });
    }
    if (search) {
      filtered = filtered.filter(function(d) {
        return Object.values(d).some(function(v) { return String(v).toLowerCase().includes(search); });
      });
    }

    if (filtered.length === 0) {
      stockTableWrapper.style.display = 'none';
      noResults.style.display = '';
      return;
    }

    noResults.style.display = 'none';
    stockTableWrapper.style.display = '';

    stockTableBody.innerHTML = filtered.map(function(row, idx) {
      var mac = row['LAN MAC Address'] || (row['LAN MAC Address + Wi-Fi'] || '').split('|')[0].replace('LAN: ', '').trim();
      var defect = row['ตำหนิ'] || '';
      var hasSpec = row['CPU'] || row['Ram'];
      return '<tr>' +
        '<td>' + (idx + 1) + '</td>' +
        '<td><span class="serial-badge">' + (row['Model'] || '-') + '</span></td>' +
        '<td><span class="serial-badge">' + (row['Serial Number'] || '-') + '</span></td>' +
        '<td>' + (row['CPU'] || '-') + '</td>' +
        '<td><span class="ram-badge">' + (row['Ram'] || '-') + '</span></td>' +
        '<td>' + (row['GPU'] || '-') + '</td>' +
        '<td>' + (row['Storage'] || '-') + '</td>' +
        '<td>' + (mac || '-') + '</td>' +
        '<td>' + (defect ? '<span class="defect-badge">' + defect + '</span>' : (hasSpec ? '<span style="color:#22c55e">OK</span>' : '<span style="color:#a1a1aa">-</span>')) + '</td>' +
      '</tr>';
    }).join('');
  }

  fetchAllData();
  setInterval(fetchAllData, 30000);
})();
