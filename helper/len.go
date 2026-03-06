package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run len.go <string>")
		return
	}

	input := os.Args[1]
	fmt.Println(len(input))
}