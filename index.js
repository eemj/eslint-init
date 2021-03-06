#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const styleGuides = require('./styles');
const { execSync, spawn } = require('child_process');

const { bold, cyan: highlight } = chalk;
const dash = chalk.green('-');

// Prompt
const promptUser = () =>
  new Promise((resolve, reject) => {
    inquirer
      .prompt([
        {
          type: 'list',
          name: 'style',
          message: 'Which style guide would you want to follow?',
          choices: styleGuides.map(style => ({
            value: style.value,
            name: style.name
          }))
        },
        {
          type: 'confirm',
          name: 'react',
          message: 'Are you going to use React?'
        }
      ])
      .then(answers => {
        let styles = [answers.style];
        if (answers.react) {
          const { react } = styleGuides.find(
            style => style.value === answers.style
          );
          if (!react.replace) styles.push(react.name);
          else styles = [react.name];
        }
        resolve(styles.map(style => `eslint-config-${style}`));
      })
      .catch(error => {
        if (error) reject(error);
      });
  });

promptUser()
  .then(configs => {
    // If we don't find a package.json file we'll create one.
    if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) {
      console.log(
        [
          dash,
          bold('Creating a'),
          highlight('package.json'),
          bold('file ...')
        ].join(' ')
      );

      execSync('npm init -y');
    }

    // Fetching peerDependencies for our configs.
    console.log(
      [
        dash,
        bold('Fetching infos for'),
        configs.map(config => highlight(config)).join(bold(', ')),
        bold('...')
      ].join(' ')
    );

    const peers = new Map();

    for (const config of configs) {
      const { peerDependencies } = JSON.parse(
        execSync(`npm info "${config}@latest" --json`)
      );
      for (const dependency in peerDependencies) {
        if (!dependency) continue;
        let version = peerDependencies[dependency];
        if (version.indexOf('||')) version = version.split(' || ').pop();
        if (!peers.has(dependency)) peers.set(dependency, version);
      }
    }

    const packages = [...peers]
      .map(([dependency, version]) => ({ dependency, version }))
      .concat(
        configs.map(config => ({ dependency: config, version: 'latest' }))
      );

    // Installing the packages we recieved above.
    console.log(
      [
        dash,
        bold('Installing'),
        packages.map(pkg => highlight(pkg.dependency)).join(bold(', ')),
        bold('...')
      ].join(' ')
    );

    const packageInstall = spawn(
      'npm',
      [
        'install',
        '-D',
        ...packages.map(pkg => `${pkg.dependency}@${pkg.version}`)
      ],
      {
        stdio: 'inherit'
      }
    );

    packageInstall.on('close', () => {
      // Creating a JSON format eslint configuration.
      console.log(dash, bold('Creating configuration ...'));

      fs.writeFileSync(
        path.join(process.cwd(), '.eslintrc.json'),
        JSON.stringify(
          {
            extends:
              configs.length === 1
                ? configs[0].match(/eslint-config-(.*?)$/)[1]
                : [
                  ...configs.map(
                    config => config.match(/eslint-config-(.*?)$/)[1]
                  )
                ]
          },
          null,
          2
        ),
        'utf8'
      );
    });
  })
  .catch(error => {
    if (error) {
      throw new Error(`Prompt Error: ${error.message} / ${error.stack}`);
    }
  });
