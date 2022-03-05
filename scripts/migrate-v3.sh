#!/bin/bash

DB_URL=$1
DB_NAME=$2

if [[ -z $DB_URL ]] || [[ -z $DB_NAME ]]; then
  echo 'You need to pass database url as first argument and database name as second argument'
  exit
fi

TOKEN_TEMP_FILE=tmp_token.json
VOTES_TEMP_FILE=tmp_votes.json
CLOSED_TEMP_FILE=tmp_closed.json

node scripts/migrate-v3.js

if [ -f $TOKEN_TEMP_FILE ]; then
  mongoimport --uri $DB_URL/$DB_NAME --collection token --type json --file $TOKEN_TEMP_FILE --jsonArray

  rm $TOKEN_TEMP_FILE
else
  echo "$TOKEN_TEMP_FILE file not exists"
fi

if [ -f $VOTES_TEMP_FILE ]; then
  mongoimport --uri $DB_URL/$DB_NAME --collection votes --type json --file $VOTES_TEMP_FILE --jsonArray

  rm $VOTES_TEMP_FILE
else
  echo "$VOTES_TEMP_FILE file not exists"
fi

if [ -f $CLOSED_TEMP_FILE ]; then
  mongoimport --uri $DB_URL/$DB_NAME --collection closed --type json --file $CLOSED_TEMP_FILE --jsonArray

  rm $CLOSED_TEMP_FILE
else
  echo "$CLOSED_TEMP_FILE file not exists"
fi
