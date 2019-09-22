const express = require('express');
const server = express();
const bodyParser = require('body-parser')
const request = require('request');
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({
  extended: true
}));

const hostname = '127.0.0.1';
const port = 5000;

server.post('/', (req, res) => {
  let question = null;
  const options = [];
  let body = req.body.text;

  let isAnonymous = false;
  let isLimited = false;
  let limit = null;
  let fetchLimit = false;

  for (let arg of body.substr(0, body.indexOf("\"")).trim().split(' ')) {
    if (fetchLimit) {
      limit = parseInt(arg);
      if (isNaN(limit)) {
        limit = 1;
        fetchLimit = false;
      } else {
        fetchLimit = false;
        continue;
      }
    }

    if (!isAnonymous && arg === 'anonymous') {
      isAnonymous = true;
    } else if (!isLimited && arg === 'limit') {
      isLimited = true;
      fetchLimit = true;
    }
  }

  if (isLimited && null === limit) {
    limit = 1;
  }

  if (req.body.text) {
    for (let option of body.match(/"[^"\\]*(?:\\[\S\s][^"\\]*)*"|'[^'\\]*(?:\\[\S\s][^'\\]*)*'/g)) {
      let opt = option.substring(1, option.length - 1);
      if (question === null) {
        question = opt;
      } else {
        options.push(opt);
      }
    }
  }
  const blocks = [];

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: question,
    },
  });
  blocks.push({
    type: 'divider',
  });

  let button_value = {
    anonymous: isAnonymous,
    limited: isLimited,
    limit: limit,
    voters: [],
    id: null,
  };

  for (let i in options) {
    let option = options[i];
    btn_value = JSON.parse(JSON.stringify(button_value));
    btn_value.id = i;
    let block = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: option,
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          emoji: true,
          text: 'Vote',
        },
        value: JSON.stringify(btn_value),
      },
    };
    blocks.push(block);
    block = {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "No votes"
        }
      ]
    };
    blocks.push(block);
  }

  const response = {
    response_type: 'in_channel',
    blocks: blocks,
  };

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(response));
});

server.post('/actions', (req, res) => {
  res.setHeader('Content-Type', 'plain/text');
  res.send('');

  let response = '';
  if (req.body.payload) {
    const payload = JSON.parse(req.body.payload);
    const user_id = payload.user.id;
    const message = payload.message;

    response = message;
    let blocks = message.blocks;
    const actions = payload.actions;
    for (let action of actions) {
      let value = JSON.parse(action.value);
      button_id = 2 + (value.id * 2);
      context_id = 2 + (value.id * 2) + 1;
      let blockBtn = blocks[button_id];
      let block = blocks[context_id];
      let voters = value.voters ? value.voters : [];
      let newVoters = '';

      if (voters.includes(user_id)) {
        voters = voters.filter(voter_id => voter_id != user_id);
      } else {
        voters.push(user_id);
      }

      if (voters.length === 0) {
        newVoters = 'No votes';
      } else {
        newVoters = '';
        for (let voter of voters) {
          newVoters += '<@'+voter+'> ';
        }

        newVoters += voters.length +' ';
        if (voters.length === 1) {
          newVoters += 'vote';
        } else {
          newVoters += 'votes';
        }
      }


      block.elements[0].text = newVoters;
      value.voters = voters;
      blockBtn.accessory.value = JSON.stringify(value);
      blocks[context_id] = block;
    }
    response.blocks = blocks;

    request({
      uri: payload.response_url,
      body: JSON.stringify(response),
      method: 'post',
      header: {
        'Content-Type': 'application/json',
      },
    }, (error, response) => {
      // console.log('response', response);
      // console.log('error', error);
    });
  }
});

server.listen(port, hostname, () => {
  console.log('Hello there!');
});

