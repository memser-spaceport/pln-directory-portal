// import { remark } from 'remark';
// import html from 'remark-html';
// import matter from 'gray-matter';
import { useEffect, useState } from 'react';
// import marked from 'marked';
import { Converter } from 'showdown';

export function useMdViewer() {
    const [response, setResponse] = useState(null);
    const testCon = new Converter({
        tables: true
        , tasklists: true,
        ghMentions: true,
        splitAdjacentBlockquotes: true,
        underline: true,
        strikethrough: true,
        simplifiedAutoLink: true,
        simpleLineBreaks: true,
        emoji: true,
        openLinksInNewWindow:true
    });

    useEffect(() => {
        const fileContent = `
| h1    |    h2   |      h3 |
|-------|---------|---------|
| 100   | [a][1]  | ![b][2] |
| *foo* | **bar** | ~~baz~~ |

- Type some Markdown on the left

## Tables

| Left columns  | Right columns |
| ------------- |:-------------:|
| left foo      | right foo     |
| left bar      | right bar     |
| left baz      | right baz     |
> or formatting instructions.

> Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.
>
>> Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.
[![N|Solid](https://cldup.com/dTxpPi9lDf.thumb.png)](https://nodesource.com/products/nsolid)
- [x] This task is done
## Installation

Dillinger requires [Node.js](https://nodejs.org/) v10+ to run.
- ✨Magic ✨
* cdnjs
https://cdnjs.cloudflare.com/ajax/libs/showdown/<version tag>/showdown.min.js
- [Introduction](#introduction)

| Plugin | README |
| ------ | ------ |
| Dropbox | [plugins/dropbox/README.md][PlDb] |
| GitHub | [plugins/github/README.md][PlGh] |
| Google Drive | [plugins/googledrive/README.md][PlGd] |
| OneDrive | [plugins/onedrive/README.md][PlOd] |
| Medium | [plugins/medium/README.md][PlMe] |
| Google Analytics | [plugins/googleanalytics/README.md][PlGa] |
 
        `;
        // const matterResult = matter(fileContent);
        // setResponse(matterResult.content);

        // const markedContent = marked.parse(fileContent);
        const test = testCon.makeHtml(fileContent);

        setResponse(test);


        // remark()
        //     .use(html)
        //     .process(matterResult.content).then((res) => {
        //         console.log(res.toString());

        //         setResponse(res.toString());
        //     });
    }, [])


    return {
        response
    }
}