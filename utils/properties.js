class Properties {
  constructor(db) {
    if (!db) {
      throw new Error('You need to pass a Mongo database as argument.');
    }

    this._db = db;
    this._propsCol = db.collection('properties');
  }

  async dbVer() {
    let props = await this._propsCol.findOne({ type: 'db' });

    if (!props) {
      props = { type: 'db', version: 0 };
      await this._propsCol.insertOne(props);
    }

    return props.version;
  }

  async setDbVer(version) {
    let props = await this._propsCol.findOne({ type: 'db' });

    if (!props) {
      props = { type: 'db', version };
      await this._propsCol.insertOne(props);
    } else {
      const query = { type: 'db' };
      await this._propsCol.updateOne(query, { $set: { version } });
    }
  }
}

module.exports = { Properties };
