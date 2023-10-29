import { remark } from 'remark';
import html from 'remark-html';
import matter from 'gray-matter';
import { useEffect, useState } from 'react';

export function useMdViewer() {
    const [response, setResponse] = useState(null);

    useEffect(() => {
        const fileContent = '# h1 Heading 8-)'
        const matterResult = matter(fileContent);

        remark()
            .use(html)
            .process(matterResult.content).then((res) => {
                console.log(res.toString());
                
                setResponse(res.toString());
            });
    }, [])

    
    return {
        response
    }
}