import { ColorResolvable, Colors } from "discord.js";

export default class Titles {

    static Title: [string,ColorResolvable, number[],string][] = [
        ["Exorcised",Colors.Grey,[0,999],""],
        ["Grassman",Colors.Green,[1000,1399],""],
        ["Specialist",Colors.Aqua,[1400,1799],""],
        ["Expert",Colors.Blue,[1800,1999],""],
        ["Candidate Master",Colors.Purple,[2000,2199],"CM"],
        ["Nim Master",Colors.Yellow,[2200,2399],"NM"],
        ["International Master",Colors.Orange,[2400,2499],"IM"],
        ["Grandmaster",Colors.Red,[2500,2999],"GM"],
        ["Omniscient",Colors.DarkRed,[3000,10000],"AMOG"] // Supremium
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