const fs = require('fs');
const old = require('../config/open_poll.json');
const oldPolls = require('../config/polls.json');

const tdata = Object.values(old.token);

try {
  fs.writeFileSync('./tmp_token.json', JSON.stringify(tdata))
} catch (err) {
  console.error(err)
}

const pdata = { votes: [], closed: oldPolls.polls.closed }
const votes = [];
const closed = [];

Object.keys(oldPolls).forEach(teamId => {
  if (teamId === 'polls') return;

  Object.keys(oldPolls[teamId]).forEach(channelId => {
    Object.keys(oldPolls[teamId][channelId]).forEach(ts => {
      votes.push({
        team: teamId,
        channel: channelId,
        ts,
        votes: oldPolls[teamId][channelId][ts],
      });
    });
  });
});

Object.keys(oldPolls.polls.closed).forEach(teamId => {
  Object.keys(oldPolls.polls.closed[teamId]).forEach(ts => {
    closed.push({
      team: teamId,
      ts: ts,
      closed: oldPolls.polls.closed[teamId][ts],
    });
  });
});

try {
  fs.writeFileSync('./tmp_votes.json', JSON.stringify(votes));
  fs.writeFileSync('./tmp_closed.json', JSON.stringify(closed));
} catch (err) {
  console.error(err)
}
