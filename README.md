# Building the plugin

1) Prereqs (only need to run once):
```
  npm install
  npm install -g gulp
```

2) Update package.json’s version

3) If building a production build
```
  export NODE_ENV=production
```

4) Finally, to actually build the vsix file
```
  gulp
  cd dist
  tfx extension create --manifest-globs vss-extension.json
```
