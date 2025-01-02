import { ColorResolvable, Colors } from "discord.js";

export default class Titles {
    // [string,ColorResolvable, number[],string][]
    static Title: [string,ColorResolvable, number[],string, string][] = [
        ["Exorcised",Colors.Grey,[0,999],"",'#A9A9A9'],
        ["Grassman",Colors.Green,[1000,1399],"",'green'],
        ["Specialist",Colors.Aqua,[1400,1799],"",'#00FFFF'],
        ["Expert",Colors.Blue,[1800,1999],"",'#0000ff'],
        ["Candidate Master",Colors.Purple,[2000,2199],"CM",'magenta'],
        ["Nim Master",Colors.Yellow,[2200,2399],"NM",'#FFFF00'],
        ["International Master",Colors.Orange,[2400,2499],"IM",'#FFA500'],
        ["Grandmaster",Colors.Red,[2500,2999],"GM",'#FF0000'],
        ["Omniscient",Colors.DarkRed,[3000,10000],"AMOG",'#8B0000'] // Supremium
    ]
    
    private static getIndex(rating: number){
        for (var i = 0; i < this.Title.length; ++i){
            let x = this.Title[i];
            if (x[2][1] < rating)
                continue;
            return i;
        }
        return -1;
    }

    public static getTitle(rating: number): [string,ColorResolvable] {
        var index: number = this.getIndex(rating);
        if (index == -1)
            return ["Deviant",Colors.DarkButNotBlack]
        return [Titles.Title[index][0],Titles.Title[index][1]]
    }

    public static getAbbrev(rating: number): string {
        var index: number = this.getIndex(rating);
        if (index == -1)
            return "";
        return Titles.Title[index][3];
    }
    
}