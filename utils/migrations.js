const { Properties } = require('./properties');
const cliProgress = require('cli-progress');
const fs = require('fs');

class Migrations {
  constructor(db) {
    if (!db) {
      throw new Error('You need to pass a Mongo database as argument.');
    }

    this._db = db;
    this._props = new Properties(db);
  }

  availableMigrations = [
    { to: 1, fct: this.migration1.name },
  ];

  async init() {
    this._dbVer = await this._props.dbVer();

    this._migrations = this.availableMigrations
      .filter((m) => m.to > this._dbVer);

    console.log(`${this._migrations.length} migration(s) available.`);

    return this;
  }

  async migrate() {
    console.log(`database version: ${this._dbVer}`)

    for (const m of this._migrations) {
      await this[m.fct]();
    }
    return this;
  }

  async migration1() {
    this._votes = this._db.collection('votes');
    this._closed = this._db.collection('closed');
    this._hidden = this._db.collection('hidden');

    let options = {
      projection: { team: 1, channel: 1, ts: 1, votes: 1 },
    };

    console.log('Retrieve data');

    let cursor = this._votes.find({}, options);
    let rCount = await this._votes.countDocuments();

    const barVotes = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    barVotes.start(rCount, 0);

    let results = await cursor.toArray();

    const table = {};
    const tableChannel = {};
    let newCount = 0;
    for (const res of results) {
      const key = `${res.channel}|${res.ts}`;
      if (!table.hasOwnProperty(res.channel)) {
        table[res.channel] = {};
      }
      if (!table[res.channel].hasOwnProperty(res.ts)) {
        table[res.channel][res.ts] = { teams: [] };
        ++newCount;
      }

      table[res.channel][res.ts].teams.push(res.team);
      const votes = table[res.channel][res.ts];
      for (const i of Object.keys(res.votes)) {
        if (!votes.hasOwnProperty(i)) {
          votes[i] = [];
        }

        for (const vote of res.votes[i]) {
          if (!votes[i].includes(vote)) {
            votes[i].push(vote);
          }
        }
      }
      table[res.channel][res.ts] = votes;

      if (!tableChannel.hasOwnProperty(res.ts)) {
        tableChannel[res.ts] = {};
      }
      if (!tableChannel[res.ts].hasOwnProperty(res.team)) {
        tableChannel[res.ts][res.team] = [];
      }
      tableChannel[res.ts][res.team].push(res.channel);

      barVotes.increment(1);
    }

    barVotes.stop();

    console.log('Migrate votes');
    const barVotes2 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    barVotes2.start(newCount, 0);

    let data = [];
    for (const channel of Object.keys(table)) {
      for (const ts of Object.keys(table[channel])) {
        // await this._votes.deleteMany({ channel, ts });
        const votes = table[channel][ts];
        delete votes.teams;
        const dbObj = {
          channel,
          ts,
          votes,
        }

        data.push(dbObj)
        barVotes2.increment(1);
      }
    }

    barVotes2.stop();

    if (data.length > 0) {
      console.log('Insert votes in database');
      await this._votes.deleteMany();
      await this._votes.insertMany(data);
      console.log(`${ data.length } documents inserted`);
    }

    this._props.setDbVer(1);

    console.log('Migrate closed');

    options = {
      projection: { team: 1, ts: 1, closed: 1 }
    }
    cursor = this._closed.find({}, options);
    rCount = await this._closed.countDocuments();

    const barClosed = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    barClosed.start(rCount, 0);

    results = await cursor.toArray();
    data = [];
    let errors = [];
    for (const res of results) {
      if (
        tableChannel.hasOwnProperty(res.ts)
        && tableChannel[res.ts].hasOwnProperty(res.team)
      ) {
        const channel = tableChannel[res.ts][res.team];
        data.push({
          channel,
          ts: res.ts,
          closed: res.closed,
        });
      } else {
        errors.push(res);
      }

      barClosed.increment(1);
    }

    barClosed.stop();

    if (errors.length > 0) {
      fs.writeFileSync('closed_reports.json', JSON.stringify(errors))
      console.error(`${ errors.length } closed polls cannot be migrated. You can see errors in closed_reports.json`);
    }

    if (data.length > 0) {
      console.log('Insert closed in database');
      await this._closed.deleteMany();
      await this._closed.insertMany(data);
      console.log(`${ data.length } documents inserted`);
    }

    console.log('Migrate hidden');

    cursor = await this._hidden.updateMany({}, { $unset: { team: '' } });

    console.log('updated database version: 1');
  }
}

module.exports = { Migrations }
