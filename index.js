var fs = require('fs');
var url = require('url');
var http = require('http');
var util = require('util');
var path = require('path');
var AdmZip = require('adm-zip');
var byline = require('byline');
var async = require('async');
var program = require('commander');
var ProgressBar = require('progress');

var mysql = require('mysql');

// -----------------------------------

var VERSION = '1.0.0';

var DOWNLOAD_DIR = './downloads/';
var GEONAMES_URL_PREFIX = 'http://download.geonames.org/export/zip/';

// -----------------------------------


// empty dir
function emptyDir(dirPath) {
  util.log('deleting files in ' + dirPath);
  try { var files = fs.readdirSync(dirPath); }
  catch(e) { return; }
  if (files.length > 0)
    for (var i = 0; i < files.length; i++) {
      var filePath = dirPath + '/' + files[i];
      if (fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
    }
}

// download file
function download(myUrl, toDir, readyCallback) {
  var urlParts = url.parse(myUrl);
  var fileName = urlParts.pathname.split('/').pop();

  try {
    fs.unlinkSync(toDir + fileName);
    util.log("deleted existing " + toDir + fileName)
  } catch(e) {}

  util.log("download " + myUrl);

  var file = fs.createWriteStream(toDir + fileName);
  http.get({host: urlParts.host, path: urlParts.pathname}, function(res) {

    if(res.statusCode == 404) {
      util.error('Error: Download not found ' + myUrl);
      process.exit(1);
    }

    res.on('data', function(data) {
      file.write(data);
    }).on('end', function() {
      file.end();

      if(readyCallback) {
        setTimeout(function() {
          readyCallback.call(null, toDir + fileName);  
        }, 2000);
      } else {
        util.log(fileName + " finished");
      }
    });
  });
}

// unzip file
function unzipFile(file, toDir, readyCallback) {
  util.log("unzip " + file);
  var zip = new AdmZip(file);
  zip.extractAllTo(toDir, true);
  util.log("finished unzip " + file);
  readyCallback.call(null);
}

// insert into mysql
function insertRecordsForFile(file, readyCallback) {
  var dirName = path.dirname(file);
  var fileName = path.basename(file, '.zip');
  var stream = byline(fs.createReadStream(dirName + "/" + fileName + '.txt'));

  util.log('inserting ' + fileName + ' into db');
  
  var bar = undefined;
  var countLines = 0;
  var countInserts = 0;
  stream.on('data', function(line) {
    countLines++;

    var values = line.split('\t');
    dbInsert(values, function() {
      countInserts++;

      if(typeof bar != 'undefined') {
        bar.tick();
      }

      if(countLines == countInserts) {
        util.log(countInserts + ' records inserted');
        util.log('finished ' + fileName);

        if(readyCallback) readyCallback.call(null);
      }
    });

  });
  stream.on('end', function() {
    bar = new ProgressBar('inserting :current/:total [:bar] :percent :etas', { total: countLines, width: 30 });
  })
}

// download file, unzip it and insert records ...
function download_unzip_insert(key, readyCallback) {
  download(GEONAMES_URL_PREFIX + key + '.zip', DOWNLOAD_DIR, function(file){
    unzipFile(file, DOWNLOAD_DIR, function() {
      insertRecordsForFile(file, readyCallback);
    });
  });
}

// -----------------------------------

program
  .version(VERSION)
  .option('-h, --host [host]', 'DB Host')
  .option('-u, --user [user]', 'DB User')
  .option('-p, --password [password]', 'DB Password')
  .option('-d, --database [database]', 'DB Database')
  .option('-t, --table [table]', 'DB table')
  .option('-c, --countries <keys>', 'comma separated list of country codes', function(val) { return val.split(','); });

program.on('--help', function(){
  console.log('  Country Codes: <keys>');
  console.log('');
  console.log('    see http://download.geonames.org/export/zip/');
  console.log('');
  console.log('  Examples:');
  console.log('');
  console.log('    index.js -h localhost -u root -p root123 -d geodb -t postal_codes -c DE,CH,ES');
  console.log('    index.js -h localhost -u root -p root123 -d geodb -t postal_codes -c allCountries');
  console.log('');
});

program.parse(process.argv);

if(!program.host) {
  util.error('Error: unknown DB host');
  process.exit(1);
}
if(!program.user) {
  util.error('Error: unknown DB user');
  process.exit(1);
}
if(!program.database) {
  util.error('Error: unknown DB database');
  process.exit(1);
}
if(!program.table) {
  util.error('Error: unknown DB table');
  process.exit(1);
}
if(!program.countries) {
  util.error('Error: no county codes');
  process.exit(1);
}


// -----------------------------------

// connect to db
var connection = mysql.createConnection({
  host: program.host,
  database: program.database,
  user: program.user,
  password: program.password || ''
});
function dbConnect(readyCallback) {
  util.log('connecting to db');
  connection.connect(function(error) {
    if(!error) {
      readyCallback.call(null);    
    } else {
      util.error(error);
      process.exit(1);
    }
  });
}

function dbCreateTable(readyCallback) {
  util.log('creating table ' + program.table);
  var sql = 'CREATE TABLE ' + program.table + ' (' +
            'country_code CHAR(2) DEFAULT NULL, ' +
            'postal_code VARCHAR(20) DEFAULT NULL, ' +
            'place_name VARCHAR(180) DEFAULT NULL, ' +
            'admin_name1 VARCHAR(100) DEFAULT NULL, ' +
            'admin_code1 VARCHAR(20) DEFAULT NULL, ' +
            'admin_name2 VARCHAR(100) DEFAULT NULL, ' +
            'admin_code2 VARCHAR(20) DEFAULT NULL, ' +
            'admin_name3 VARCHAR(100) DEFAULT NULL, ' +
            'admin_code3 VARCHAR(20) DEFAULT NULL, ' +
            'latitude VARCHAR(255) DEFAULT NULL, ' +
            'longitude VARCHAR(255) DEFAULT NULL, ' +
            'accuracy VARCHAR(255) DEFAULT NULL ' +
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8'
            ;
  connection.query(sql, function(error, results){
    if(error) {
      util.error(error);
      process.exit(1);
    }
    readyCallback.call(null);
  });  
}

function dbDeleteTable(readyCallback) {
  util.log('deleting table ' + program.table);
  connection.query('DROP TABLE IF EXISTS ' + program.table, function(error, results){
    if(error) {
      util.error(error);
      process.exit(1);
    }
    readyCallback.call(null);
  });
}

function dbInsert(values, successCallback) {
  connection.query('INSERT INTO ' + program.table + 
    ' (country_code, postal_code, place_name, admin_name1, admin_code1, admin_name2, admin_code2, admin_name3, admin_code3, latitude, longitude, accuracy)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', values, function(error, results){
    if(error) {
      util.error(error);
      process.exit(1);
    } else {
      if(successCallback) successCallback.call(null);
    }
  });
}


// -----------------------------------


// run ...
util.log('starting script ...');
dbConnect(function(){
  dbDeleteTable(function(){
    dbCreateTable(function(){
      start.call(null);
    })
  })
});
function start() {
  emptyDir(DOWNLOAD_DIR);
  async.forEachSeries(program.countries, function(item, callback) {
    download_unzip_insert(item, callback);
  }, function(err) {
    util.log('script finished');
    process.exit(0);
  })  
}




