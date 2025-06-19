import { ColorResolvable, Colors } from "discord.js";

export default class Titles {
    // [string,ColorResolvable, number[],string][]
    static Title: [string,ColorResolvable, number[],string, string][] = [
        ["Easy",Colors.Grey,[0,999],"",'#75F347'],
        ["Medium",Colors.Green,[1000,1399],"",'#FFFE00'],
        ["Hard",Colors.Aqua,[1400,1799],"",'#D7C00'],
        ["Difficult",Colors.Blue,[1800,1999],"",'#FF3232'],
        ["Challenging",Colors.Purple,[2000,2199],"",'#A00000'],
        ["Intense",Colors.Yellow,[2200,2399],"",'#19232D'],
        ["Remorseless",Colors.Orange,[2400,2499],"",'#C800C8'],
        ["Insane",Colors.Red,[2500,2999],"CM",'#0000FF'],
        ["Extreme",Colors.DarkRed,[3000,10000],"NM",'#0389FF'],
        ["Terrifying",Colors.DarkRed,[3000,10000],"IM",'#00FFFF'],
        ["Catastrophic",Colors.DarkRed,[3000,10000],"GM",'#FFFFFF'],        
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
            return ["Nil",Colors.DarkButNotBlack]
        return [Titles.Title[index][0],Titles.Title[index][1]]
    }

    public static getAbbrev(rating: number): string {
        var index: number = this.getIndex(rating);
        if (index == -1)
            return "";
        return Titles.Title[index][3];
    }
    
}