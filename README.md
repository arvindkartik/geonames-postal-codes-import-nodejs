geonames-postal-codes-import-nodejs
===================================

Using [Node.js](http://nodejs.org) to import Postal Codes from [GeoNames.org](http://www.geonames.org) into a database. See http://download.geonames.org/export/zip/ for a complete list of available postal codes. 

Currently, only mysql is supported. Please adapt functions ````dbConnect()````, ````dbCreateTable()````, ````dbDeleteTable()```` and ````dbInsert()```` in ````index.js```` to support other databases.


Installation
------------

````
npm install geonames-postal-codes-import-nodejs
````


Usage
-----

````
cd node_modules/geonames-postal-codes-import-nodejs
node index.js [options]

Options:

    -h, --help                 output usage information
    -V, --version              output the version number
    -h, --host [host]          DB Host
    -u, --user [user]          DB User
    -p, --password [password]  DB Password
    -d, --database [database]  DB Database
    -t, --table [table]        DB table
    -c, --countries <keys>     comma separated list of country codes

  Country Codes: <keys>

    see http://download.geonames.org/export/zip/

  Examples:

    index.js -h localhost -u root -p root123 -d geodb -t postal_codes -c DE,CH,ES
    index.js -h localhost -u root -p root123 -d geodb -t postal_codes -c allCountries
```` 