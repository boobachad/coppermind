interface ActivityMapping {
    category: string;
    description: string;
    isProductive: boolean;
}

/**
 * Maps a URL to an activity category based on hostname patterns.
 * Uses existing activity categories from config.ts
 */
export function mapUrlToActivity(url: string): ActivityMapping {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Competitive Coding
    if (hostname.includes('leetcode.com')) {
        return { category: 'coding_leetcode', description: 'LeetCode', isProductive: true };
    }
    if (hostname.includes('codeforces.com')) {
        return { category: 'coding_codeforces', description: 'Codeforces', isProductive: true };
    }
    if (hostname.includes('codechef.com') || hostname.includes('atcoder.jp') || hostname.includes('hackerrank.com')) {
        return { category: 'cpp', description: 'Competitive Programming', isProductive: true };
    }

    // Code Repositories -> real_projects
    if (hostname.includes('github.com') || hostname.includes('gitlab.com') || hostname.includes('bitbucket.org')) {
        return { category: 'real_projects', description: 'Code Repository', isProductive: true };
    }

    // Q&A / Forums -> book (learning)
    if (hostname.includes('stackoverflow.com') || hostname.includes('stackexchange.com')) {
        return { category: 'book', description: 'Stack Overflow', isProductive: true };
    }

    // Documentation -> book
    if (hostname.includes('docs.') || hostname.includes('developer.') || url.includes('/docs/')) {
        return { category: 'book', description: 'Documentation', isProductive: true };
    }

    // Online Learning -> book
    if (hostname.includes('coursera.org') || hostname.includes('udemy.com') || hostname.includes('edx.org') || hostname.includes('khanacademy.org')) {
        return { category: 'book', description: 'Online Learning', isProductive: true };
    }

    // Tech Articles -> book
    if (hostname.includes('medium.com') || hostname.includes('dev.to') || hostname.includes('hashnode.')) {
        return { category: 'book', description: 'Tech Article', isProductive: true };
    }

    // Tech News -> book
    if (hostname.includes('news.ycombinator.com')) {
        return { category: 'book', description: 'Tech News', isProductive: true };
    }

    // College / Education
    if (hostname.includes('.edu') || hostname.includes('canvas.') || hostname.includes('blackboard.') || hostname.includes('moodle.')) {
        return { category: 'college', description: 'College', isProductive: true };
    }

    // Entertainment (Streaming + Social Media)
    if (hostname.includes('youtube.com') || hostname.includes('netflix.com') || hostname.includes('twitch.tv') || hostname.includes('primevideo.')) {
        return { category: 'entertainment', description: 'Streaming', isProductive: false };
    }
    if (hostname.includes('reddit.com') || hostname.includes('twitter.com') || hostname.includes('x.com') || hostname.includes('facebook.com') || hostname.includes('instagram.com') || hostname.includes('tiktok.com')) {
        return { category: 'entertainment', description: 'Social Media', isProductive: false };
    }

    // Work Communication -> real_projects
    if (hostname.includes('slack.com') || hostname.includes('teams.microsoft.com') || hostname.includes('zoom.us') || hostname.includes('discord.com')) {
        return { category: 'real_projects', description: 'Communication', isProductive: true };
    }

    // Email -> misc
    if (hostname.includes('mail.google.com') || hostname.includes('outlook.') || hostname.includes('protonmail.')) {
        return { category: 'misc', description: 'Email', isProductive: false };
    }

    // Local Development -> side_projects
    if (hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('192.168.')) {
        return { category: 'side_projects', description: 'Local Dev', isProductive: true };
    }

    // Default - unclassified surfing
    return { category: 'surfing', description: 'Surfing', isProductive: false };
}
