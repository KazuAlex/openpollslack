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
  if (req.body.text) {
    for (let option of req.body.text.match(/"[^"\\]*(?:\\[\S\s][^"\\]*)*"|'[^'\\]*(?:\\[\S\s][^'\\]*)*'/g)) {
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

  for (let i in options) {
    let option = options[i];
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
        value: 'vote_for_'+i,
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
      let value = action.value;
      value = parseInt(value.substring(9));
      context_id = 2 + (value * 2) + 1;
      let block = blocks[context_id];
      const voters = block.elements[0].text;
      let newVoters = null;
      if (voters === 'No votes') {
        newVoters = '<@'+ user_id +'> 1 vote';
      } else {
        let userFound = false;
        const allVoters = [];
        for (let voter of voters.match(/<.*>/g)) {
          const voter_id = voter.substring(2, voter.length - 1);
          if (voter_id == user_id) {
            userFound = true;
          } else {
            if (!newVoters) {
              newVoters = voter;
            } else {
              newVoters += ' '+voter;
            }
            allVoters.push(voter_id);
          }
        }

        if (!userFound) {
          allVoters.push(user_id);
          newVoters += ' <@'+user_id+'>';
        }

        if (allVoters.length === 1) {
        } else if (allVoters.length > 1) {
          newVoters = ' '+ allVoters.length +' votes';
        } else {
          newVoters = 'No votes';
        }
      }
      block.elements[0].text = newVoters;
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

