const express = require('express');
const server = express();
const bodyParser = require('body-parser')
const request = require('request');
const compression = require('compression');
const helmet = require('helmet');
const config = require('config');
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({
  extended: true
}));
server.use(compression());
server.use(helmet());

const hostname = '127.0.0.1';
const port = 5000;

server.post('/', (req, res) => {
  res.setHeader('Content-Type', 'plain/text');
  res.send('');

  const response_url = req.body ? req.body.response_url : null;

  if (!response_url) {
    return;
  }

  let question = null;
  const options = [];
  let body = req.body.text;
  const user_id = req.body.user_id;
  const cmd = req.body.command+' '+req.body.text;

  let isAnonymous = false;
  let isLimited = false;
  let limit = null;
  let fetchLimit = false;

  if (body && body.trim() === 'help') {
    const response = {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Open source poll for slack*',
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Simple poll*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "```\n/openpoll \"What's your favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"\n```",
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Anonymous poll*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "```\n/openpoll anonymous \"What's your favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"\n```",
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Limited choice poll*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "```\n/openpoll limit 2 \"What's your favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"\n```",
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Anonymous limited choice poll*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "```\n/openpoll anonymous limit 2 \"What's your favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"\n```",
          },
        },
      ],
    };

    request({
      uri: response_url,
      body: JSON.stringify(response),
      method: 'post',
      header: {
        'Content-Type': 'application/json',
      },
    });
    return;
  } else if (body) {
    if (body.startsWith('anonymous')) {
      isAnonymous = true;
      body = body.substring(9).trim();
    }
    if (body.startsWith('limit')) {
      body = body.substring(5).trim();
      isLimited = true;
      if (!isNaN(parseInt(body.charAt(0)))) {
        limit = parseInt(body.substring(0, body.indexOf(' ')));
        body = body.substring(body.indexOf(' ')).trim();
      }
    }
    if (!isAnonymous && body.startsWith('anonymous')) {
      isAnonymous = true;
      body = body.substring(9).trim();
    }

    const lastSep = body.split('').pop();
    const firstSep = body.charAt(0);

    if (isLimited && null === limit) {
      limit = 1;
    }

    const regexp = new RegExp(firstSep+'[^'+firstSep+'\\\\]*(?:\\\\[\S\s][^'+lastSep+'\\\\]*)*'+lastSep, 'g');
    for (let option of body.match(regexp)) {
      let opt = option.substring(1, option.length - 1);
      if (question === null) {
        question = opt;
      } else {
        options.push(opt);
      }
    }

    const blocks = [];

    if (question && options) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: question,
        },
      });

      let voteLimit = 0;

      if (isAnonymous || isLimited) {
        let elements = [];
        if (isAnonymous) {
          elements.push({
            type: 'mrkdwn',
            text: ':shushing_face: Anonymous poll',
          });
        }
        if (isLimited) {
          elements.push({
            type: 'mrkdwn',
            text: ':warning: Limited to '+ limit + ' vote' +(limit > 1 ? 's': ''),
          });
        }
        elements.push({
          type: 'mrkdwn',
          text: ':eyes: by <@'+user_id+'>'
        });
        blocks.push({
          type: 'context',
          elements: elements,
        });
      }
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
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'No votes',
            }
          ],
        };
        blocks.push(block);
      }

      blocks.push({
        type: 'divider',
      });

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '<https://github.com/kazualex/openpollslack.git|Need help ?>',
          },
          {
            type: 'mrkdwn',
            text: ':information_source: '+cmd,
          }
        ],
      });

      const response = {
        response_type: 'in_channel',
        blocks: blocks,
      };

      request({
        uri: response_url,
        body: JSON.stringify(response),
        method: 'post',
        header: {
          'Content-Type': 'application/json',
        },
      });
    }
  }
});

server.post('/actions', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
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
      if (value.anonymous || value.limited) {
        button_id += 1;
        context_id += 1;
      }
      let blockBtn = blocks[button_id];
      let block = blocks[context_id];
      let voters = value.voters ? value.voters : [];
      let newVoters = '';

      let removeVote = false;
      if (voters.includes(user_id)) {
        removeVote = true;
        voters = voters.filter(voter_id => voter_id != user_id);
      } else {
        voters.push(user_id);
      }

      if (value.limited && value.limit) {
        let voteCount = 0;
        for (let b of blocks) {
          if (b.accessory) {
            let val = JSON.parse(b.accessory.value);
            if (val.voters && val.voters.includes(user_id)) {
              ++voteCount;
            }
          }
        }

        if (removeVote) {
          voteCount -= 1;
        }

        if (voteCount >= value.limit) {
          return;
        }
      }

      if (voters.length === 0) {
        newVoters = 'No votes';
      } else {
        newVoters = '';
        for (let voter of voters) {
          if (!value.anonymous) {
            newVoters += '<@'+voter+'> ';
          }
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
    });
  }
});

server.get('/redirect', (req, res) => {
  request({
    uri: 'https://slack.com/api/oauth.access',
    form: {
      client_id: config.get('client_id'),
      client_secret: config.get('client_secret'),
      code: req.query.code,
    },
    method: 'post',
    header: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  }, (error, response, body) => {
    // do nothing
  });

  let uri = 'https://openpoll.slack.alcor.space';
  if (req.query.code) {
    uri += '?oauth=success';
  } else {
    uri += '?oauth=error';
  }
  res.status(301).redirect(uri);
});

server.listen(port, hostname, () => {
  console.log('Hello there!');
});

