package com.shahbytes.tinylink;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TinylinkApplication {

	public static void main(String[] args) {
		SpringApplication.run(TinylinkApplication.class, args);
	}

}
