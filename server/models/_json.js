const { DataTypes } = require("sequelize");

/**
 * Helpers for storing rich, nested objects (formerly Mongo sub-documents) as
 * JSON in an Azure SQL NVARCHAR(MAX) column, while preserving the ergonomic
 * mutation style the original Mongoose code relies on, e.g.:
 *
 *     user.twoFactorAuth.enabled = true;
 *     user.refreshTokens.push(token);
 *     await user.save();
 *
 * A naive getter that returns a freshly-parsed object would drop those in-place
 * mutations. Instead each JSON attribute caches a single live object on the
 * instance; `attachJsonHooks` re-serialises that cache on every save.
 */

function deepClone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Build a Sequelize attribute definition backed by a TEXT (NVARCHAR(MAX))
 * column that transparently reads/writes JSON.
 *
 * @param {string} name  attribute name (must match the key it is assigned to)
 * @param {*} defaultValue value returned when the column is null
 */
function jsonAttr(name, defaultValue = null) {
  return {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue:
      defaultValue === null || defaultValue === undefined
        ? null
        : JSON.stringify(defaultValue),
    get() {
      if (!this._jsonCache) this._jsonCache = {};
      if (this._jsonCache[name] === undefined) {
        const raw = this.getDataValue(name);
        if (raw === null || raw === undefined) {
          this._jsonCache[name] = deepClone(defaultValue);
        } else if (typeof raw === "string") {
          try {
            this._jsonCache[name] = JSON.parse(raw);
          } catch (e) {
            this._jsonCache[name] = deepClone(defaultValue);
          }
        } else {
          this._jsonCache[name] = raw;
        }
      }
      return this._jsonCache[name];
    },
    set(val) {
      if (!this._jsonCache) this._jsonCache = {};
      this._jsonCache[name] = val;
      this.setDataValue(name, val == null ? null : JSON.stringify(val));
    },
  };
}

/**
 * Register save-time serialisation so in-place mutations of cached JSON objects
 * are persisted. Call once per model, passing the list of JSON attribute names.
 */
function attachJsonHooks(Model, fieldNames) {
  const serialize = (instance) => {
    if (!instance._jsonCache) return;
    for (const name of fieldNames) {
      if (instance._jsonCache[name] !== undefined) {
        const v = instance._jsonCache[name];
        instance.setDataValue(name, v == null ? null : JSON.stringify(v));
      }
    }
  };
  Model.beforeCreate(serialize);
  Model.beforeUpdate(serialize);
  Model.beforeSave(serialize);
  // Clear the cache after a load so a reloaded row re-parses fresh data.
  Model.afterFind((result) => {
    const clear = (inst) => {
      if (inst && inst._jsonCache) inst._jsonCache = {};
    };
    if (Array.isArray(result)) result.forEach(clear);
    else clear(result);
  });
}

module.exports = { jsonAttr, attachJsonHooks, deepClone };
